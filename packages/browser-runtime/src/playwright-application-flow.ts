import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import type { BrowserContext, Frame, Page, Request, Route } from "playwright";
import {
  ApplyExecutionResultSchema,
  type ApplyExecutionResult,
  type ApplicationAttemptBlocker,
  type ApplicationAttemptCheckpoint,
  type ApplicationAttemptExternalWriteEvidence,
  type ApplicationAttemptQuestion,
  type CandidateProfile,
} from "@unemployed/contracts";
import { isPageOwnedReadRequest } from "./application-read-request-policy";
import {
  classifyIntermediateMutationRequest,
  INTERMEDIATE_MUTATION_WINDOW_DURATION_MS,
  INTERMEDIATE_MUTATION_WINDOW_MAX_REQUESTS,
  type IntermediateMutationResourceKind,
  type IntermediateMutationWindowSnapshot,
} from "./application-intermediate-mutation-policy";
import type { ExecuteApplicationFlowInput } from "./runtime-types";
import {
  bringPageToFrontBestEffort,
  isHttpUrlLike,
} from "./playwright-browser-runtime-utils";

async function safePageTitle(page: Page): Promise<string | null> {
  try {
    const title = await page.title();
    return title.trim() ? title.trim() : null;
  } catch {
    return null;
  }
}

function safePageUrl(page: Page): string | null {
  try {
    const url = page.url();
    return isHttpUrlLike(url) ? url : null;
  } catch {
    return null;
  }
}

async function resolveLivePageForContext(
  context: BrowserContext,
  options?: { bringToFront?: boolean },
): Promise<Page> {
  const openPages = context.pages().filter((page) => !page.isClosed());
  const livePage = [...openPages]
    .reverse()
    .find((page) => isHttpUrlLike(page.url()));
  const page = livePage ?? openPages.at(-1) ?? (await context.newPage());

  if (options?.bringToFront !== false) {
    await bringPageToFrontBestEffort(page);
  }

  return page;
}

const APPLICATION_FORM_CONTROL_SELECTOR = [
  "input:not([type='button']):not([type='submit']):not([type='reset']):not([aria-hidden='true'])",
  "textarea:not([aria-hidden='true'])",
  "select:not([aria-hidden='true'])",
  "[contenteditable='true']:not([aria-hidden='true'])",
  "[role='textbox'][aria-required='true']:not([aria-hidden='true'])",
  "[role='combobox'][aria-required='true']:not([aria-hidden='true'])",
  "[role='radio'][aria-required='true']:not([aria-hidden='true'])",
  "[role='checkbox'][aria-required='true']:not([aria-hidden='true'])",
].join(", ");

const APPLICATION_ACTION_CONTROL_SELECTOR = [
  "button",
  "input[type='button']",
  "input[type='submit']",
  "[role='button']",
  "a[role='button']",
].join(", ");

const MAX_APPLICATION_PREPARATION_STEPS = 8;
const FORM_STABILITY_SAMPLE_INTERVAL_MS = 750;
const REQUIRED_STABLE_FORM_SAMPLES = 3;
const MAX_TRANSIENT_FORM_SAMPLES = 12;

export interface PrepareOnlyBlockedAttempt {
  kind:
    | "dom_submit"
    | "form_submit"
    | "form_request_submit"
    | "send_beacon"
    | "fetch"
    | "xhr"
    | "websocket"
    | "webtransport"
    | "eventsource"
    | "window_open"
    | "network_request"
    | "popup_open"
    | "download";
  method: string;
  url: string | null;
  at: string;
  /**
   * Whether the attempt carried a value that was in a form field when it was
   * blocked. Set by the page guard, which can see the form; unset for
   * network-layer blocks, which are then treated as if they might have.
   */
  carriedPreparedValue?: boolean;
}

type WebTransportPageConstructor = new (url: string | URL) => unknown;

const PREPARE_ONLY_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Channels and beacons are never opened while preparation is unauthorized.
const PREPARE_ONLY_DENIED_RESOURCE_TYPES = new Set([
  "websocket",
  "eventsource",
  "ping",
]);

// Resources the page guard cannot inspect are beacons when they carry a query
// string. Fetch and XHR are judged by the page guard, which sees the form's
// current values, and by the read policy below.
const PREPARE_ONLY_QUERY_GUARDED_RESOURCE_TYPES = new Set([
  "image",
  "media",
  "texttrack",
  "other",
]);

const PREPARE_ONLY_READ_RESOURCE_TYPES = new Set(["fetch", "xhr"]);

/**
 * Network-layer view of a page-owned read: the page guard has already
 * refused anything carrying a form value, so this only re-checks the shape.
 */
function isNetworkLayerPageOwnedRead(request: Request): boolean {
  return (
    PREPARE_ONLY_READ_RESOURCE_TYPES.has(request.resourceType()) &&
    isPageOwnedReadRequest({
      method: request.method(),
      url: request.url(),
      bodyText: request.postData(),
      preparedValues: [],
    })
  );
}

export interface PrepareOnlyGuardSnapshot {
  installed: boolean;
  blockedAttempts: PrepareOnlyBlockedAttempt[];
}

const prepareOnlyNetworkGuardStates = new WeakMap<
  Page,
  {
    blockedAttempts: PrepareOnlyBlockedAttempt[];
    allowedIntermediateRequests: WeakSet<Request>;
    verifiedIntermediateWriteCount: number;
    intermediateMutationsAuthorized: boolean;
    intermediateMutationAllowedOrigins: string[];
    intermediateMutationWindow: IntermediateMutationWindowSnapshot | null;
    initScriptInstalled: boolean;
    serviceWorkerInitScriptInstalled: boolean;
    responseListenerInstalled: boolean;
    webSocketListenerInstalled: boolean;
  }
>();

/**
 * Runs inside the application page. Keep this function self-contained because
 * Playwright serializes it before evaluation in the browser context.
 */
export function installPrepareOnlyMutationGuardInPage(
  intermediateMutationsAuthorized = false,
): void {
  interface InternalGuardState extends PrepareOnlyGuardSnapshot {
    intermediateMutationsAuthorized: boolean;
    intermediateMutationWindow: IntermediateMutationWindowSnapshot | null;
    submitListenerInstalled: boolean;
    formSubmitWrapper: typeof HTMLFormElement.prototype.submit | null;
    formRequestSubmitWrapper:
      | typeof HTMLFormElement.prototype.requestSubmit
      | null;
    sendBeaconWrapper: typeof navigator.sendBeacon | null;
    fetchWrapper: typeof window.fetch | null;
    xhrOpenWrapper: typeof XMLHttpRequest.prototype.open | null;
    xhrSendWrapper: typeof XMLHttpRequest.prototype.send | null;
    xhrMethods: WeakMap<XMLHttpRequest, { method: string; url: string | null }>;
    webSocketWrapper: typeof WebSocket | null;
    eventSourceWrapper: typeof EventSource | null;
    webTransportWrapper: WebTransportPageConstructor | null;
    windowOpenWrapper: typeof window.open | null;
  }

  const pageWindow = window as unknown as Record<string, unknown>;
  const existingState = pageWindow["__unemployedPrepareOnlyMutationGuardV1"] as
    | InternalGuardState
    | undefined;
  const state: InternalGuardState = existingState ?? {
    installed: true,
    blockedAttempts: [],
    intermediateMutationsAuthorized,
    intermediateMutationWindow: null,
    submitListenerInstalled: false,
    formSubmitWrapper: null,
    formRequestSubmitWrapper: null,
    sendBeaconWrapper: null,
    fetchWrapper: null,
    xhrOpenWrapper: null,
    xhrSendWrapper: null,
    xhrMethods: new WeakMap(),
    webSocketWrapper: null,
    eventSourceWrapper: null,
    webTransportWrapper: null,
    windowOpenWrapper: null,
  };
  state.intermediateMutationsAuthorized = intermediateMutationsAuthorized;
  pageWindow["__unemployedPrepareOnlyMutationGuardV1"] = state;

  const normalizeMethod = (value: string | null | undefined): string =>
    (value || "GET").trim().toUpperCase() || "GET";
  const normalizeUrl = (value: unknown): string | null => {
    try {
      if (typeof value === "string" || value instanceof URL) {
        return new URL(String(value), window.location.href).toString();
      }
      if (typeof Request !== "undefined" && value instanceof Request) {
        return new URL(value.url, window.location.href).toString();
      }
    } catch {
      return null;
    }
    return null;
  };
  const recordBlockedAttempt = (
    kind: PrepareOnlyBlockedAttempt["kind"],
    method: string,
    url: string | null,
    carriedPreparedValue?: boolean,
  ): void => {
    state.blockedAttempts.push({
      kind,
      method: normalizeMethod(method),
      url,
      at: new Date().toISOString(),
      ...(carriedPreparedValue === undefined ? {} : { carriedPreparedValue }),
    });
    state.blockedAttempts = state.blockedAttempts.slice(-32);
  };
  const PREPARED_VALUE_SKIP_TYPES = new Set([
    "hidden",
    "checkbox",
    "radio",
    "submit",
    "button",
    "file",
    "image",
    "reset",
  ]);
  const readFieldValues = (
    root: {
      querySelectorAll?: (selector: string) => ArrayLike<unknown>;
    } | null,
  ): string[] => {
    const values: string[] = [];
    if (!root || typeof root.querySelectorAll !== "function") return values;
    for (const element of Array.from(
      root.querySelectorAll(
        "input, textarea, select, [contenteditable='true']",
      ),
    ) as Array<{
      type?: string;
      value?: unknown;
      textContent?: string | null;
    }>) {
      if (
        typeof element.type === "string" &&
        PREPARED_VALUE_SKIP_TYPES.has(element.type)
      ) {
        continue;
      }
      const value =
        typeof element.value === "string"
          ? element.value
          : (element.textContent ?? "");
      const trimmed = value.trim();
      if (trimmed.length >= 3) values.push(trimmed);
    }
    return values;
  };
  /** A form submission always carries its own filled fields. */
  const formCarriesPreparedValue = (form: unknown): boolean | undefined =>
    form && typeof form === "object"
      ? readFieldValues(
          form as {
            querySelectorAll?: (selector: string) => ArrayLike<unknown>;
          },
        ).length > 0
      : undefined;
  // Mirrors application-read-request-policy.ts; this function is serialized
  // into the page and cannot import. A page-owned read (safe method, or a
  // GraphQL query) is allowed unless it carries a value that is currently in
  // a form field, which is the only way a read could send a prepared answer.
  const collectPreparedValues = (): string[] =>
    readFieldValues(typeof document === "undefined" ? null : document);
  const requestCarriesPreparedValue = (
    url: string | null,
    bodyText: string | null,
  ): boolean => {
    const preparedValues = collectPreparedValues();
    return (
      carriesPreparedValue(url, preparedValues) ||
      carriesPreparedValue(bodyText, preparedValues)
    );
  };
  const carriesPreparedValue = (
    text: string | null,
    preparedValues: readonly string[],
  ): boolean => {
    if (!text) return false;
    let decoded = text;
    try {
      decoded = decodeURIComponent(text);
    } catch {
      /* keep the raw text */
    }
    return preparedValues.some(
      (value) => text.includes(value) || decoded.includes(value),
    );
  };
  const isGraphQlReadBody = (bodyText: string | null): boolean => {
    if (!bodyText || bodyText.length > 65_536) return false;
    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      return false;
    }
    const operations = Array.isArray(parsed) ? parsed : [parsed];
    if (operations.length === 0) return false;
    return operations.every((operation) => {
      if (typeof operation !== "object" || operation === null) return false;
      const query = (operation as { query?: unknown }).query;
      if (typeof query !== "string") return false;
      const graphDocument = query.replace(/#[^\n]*/g, " ").trim();
      return (
        /^(?:query\b|\{)/u.test(graphDocument) &&
        !/\b(?:mutation|subscription)\b/u.test(graphDocument)
      );
    });
  };
  const isPageOwnedRead = (
    method: string,
    url: string | null,
    bodyText: string | null,
  ): boolean => {
    const normalized = normalizeMethod(method);
    if (["GET", "HEAD", "OPTIONS"].includes(normalized)) {
      return !carriesPreparedValue(url, collectPreparedValues());
    }
    if (normalized === "POST" && isGraphQlReadBody(bodyText)) {
      const preparedValues = collectPreparedValues();
      return (
        !carriesPreparedValue(url, preparedValues) &&
        !carriesPreparedValue(bodyText, preparedValues)
      );
    }
    return false;
  };
  const canAllowIntermediateRequest = (input: {
    bodyText?: string | null;
    kind: IntermediateMutationResourceKind;
    method: string;
    url: string | null;
  }): boolean => {
    const mutationWindow = state.intermediateMutationWindow;
    if (
      !state.intermediateMutationsAuthorized ||
      !mutationWindow ||
      Date.now() > mutationWindow.expiresAtMs ||
      mutationWindow.remainingRequests <= 0 ||
      !["fetch", "xhr"].includes(input.kind) ||
      !["POST", "PUT", "PATCH"].includes(normalizeMethod(input.method))
    ) {
      return false;
    }
    let parsedUrl: URL;
    try {
      if (!input.url) {
        return false;
      }
      parsedUrl = new URL(input.url);
    } catch {
      return false;
    }
    if (parsedUrl.origin !== mutationWindow.expectedOrigin) {
      return false;
    }
    const signal = `${parsedUrl.pathname} ${parsedUrl.search} ${
      input.bodyText?.slice(0, 8_192) ?? ""
    }`.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
    const finalActionSignal =
      /(?:^|[^a-z0-9])(?:submit|submission|finali[sz]e|complete[-_\s]*(?:the[-_\s]*)?application|send[-_\s]*application|apply[-_\s]*(?:now|job)|create[-_\s]*account|register)(?:[^a-z0-9]|$)/iu;
    const intermediateActionSignal =
      /(?:^|[^a-z0-9])(?:autosave|auto[-_\s]*save|draft|save[-_\s]*(?:field|answer|progress|draft)?|update[-_\s]*(?:field|answer|progress|draft|application|form)?|field|answer|attachment|upload|progress)(?:[^a-z0-9]|$)/iu;
    if (
      finalActionSignal.test(signal) ||
      !intermediateActionSignal.test(signal)
    ) {
      return false;
    }
    mutationWindow.remainingRequests -= 1;
    return true;
  };

  if (!state.submitListenerInstalled) {
    document.addEventListener(
      "submit",
      (event) => {
        const form =
          event.target instanceof HTMLFormElement ? event.target : null;
        recordBlockedAttempt(
          "dom_submit",
          form?.method ?? "FORM",
          normalizeUrl(form?.action ?? window.location.href),
          formCarriesPreparedValue(form),
        );
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true,
    );
    state.submitListenerInstalled = true;
  }

  if (HTMLFormElement.prototype.submit !== state.formSubmitWrapper) {
    const guardedFormSubmit: typeof HTMLFormElement.prototype.submit =
      function guardedFormSubmit(this: HTMLFormElement): void {
        recordBlockedAttempt(
          "form_submit",
          this.method || "FORM",
          normalizeUrl(this.action || window.location.href),
          formCarriesPreparedValue(this),
        );
      };
    HTMLFormElement.prototype.submit = guardedFormSubmit;
    state.formSubmitWrapper = guardedFormSubmit;
  }

  if (
    HTMLFormElement.prototype.requestSubmit !== state.formRequestSubmitWrapper
  ) {
    const guardedRequestSubmit: typeof HTMLFormElement.prototype.requestSubmit =
      function guardedRequestSubmit(this: HTMLFormElement): void {
        recordBlockedAttempt(
          "form_request_submit",
          this.method || "FORM",
          normalizeUrl(this.action || window.location.href),
          formCarriesPreparedValue(this),
        );
      };
    HTMLFormElement.prototype.requestSubmit = guardedRequestSubmit;
    state.formRequestSubmitWrapper = guardedRequestSubmit;
  }

  if (
    typeof navigator.sendBeacon === "function" &&
    navigator.sendBeacon !== state.sendBeaconWrapper
  ) {
    const guardedSendBeacon: typeof navigator.sendBeacon = (url, data) => {
      const beaconUrl = normalizeUrl(url);
      const beaconText =
        typeof data === "string"
          ? data
          : typeof URLSearchParams !== "undefined" &&
              data instanceof URLSearchParams
            ? data.toString()
            : null;
      recordBlockedAttempt(
        "send_beacon",
        "POST",
        beaconUrl,
        data != null && beaconText === null
          ? undefined
          : requestCarriesPreparedValue(beaconUrl, beaconText),
      );
      return false;
    };
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: guardedSendBeacon,
      writable: true,
    });
    state.sendBeaconWrapper = guardedSendBeacon;
  }

  if (
    typeof window.fetch === "function" &&
    window.fetch !== state.fetchWrapper
  ) {
    const originalFetch = window.fetch.bind(window);
    const guardedFetch: typeof window.fetch = (resource, init) => {
      const method = normalizeMethod(
        init?.method ??
          (typeof Request !== "undefined" && resource instanceof Request
            ? resource.method
            : "GET"),
      );
      const url = normalizeUrl(resource);
      const bodyText =
        typeof init?.body === "string"
          ? init.body
          : typeof URLSearchParams !== "undefined" &&
              init?.body instanceof URLSearchParams
            ? init.body.toString()
            : null;
      // A body the guard cannot read (FormData, Blob, a stream) may carry
      // anything, so its attempt is judged as unknown rather than clean.
      const bodyOpaque = init?.body != null && bodyText === null;
      if (
        !isPageOwnedRead(method, url, bodyText) &&
        !canAllowIntermediateRequest({
          bodyText,
          kind: "fetch",
          method,
          url,
        })
      ) {
        recordBlockedAttempt(
          "fetch",
          method,
          url,
          bodyOpaque ? undefined : requestCarriesPreparedValue(url, bodyText),
        );
        return Promise.reject(
          new DOMException(
            "Prepare-only mode blocked a new network request while field mutations were unauthorized.",
            "AbortError",
          ),
        );
      }
      return originalFetch(resource, init);
    };
    window.fetch = guardedFetch;
    state.fetchWrapper = guardedFetch;
  }

  if (
    typeof XMLHttpRequest !== "undefined" &&
    (XMLHttpRequest.prototype.open !== state.xhrOpenWrapper ||
      XMLHttpRequest.prototype.send !== state.xhrSendWrapper)
  ) {
    const originalOpen = Reflect.get(XMLHttpRequest.prototype, "open");
    const originalSend = Reflect.get(XMLHttpRequest.prototype, "send");
    const guardedOpen: typeof XMLHttpRequest.prototype.open =
      function guardedOpen(
        this: XMLHttpRequest,
        method: string,
        url: string | URL,
        async = true,
        username?: string | null,
        password?: string | null,
      ): void {
        state.xhrMethods.set(this, {
          method: normalizeMethod(method),
          url: normalizeUrl(url),
        });
        Reflect.apply(originalOpen, this, [
          method,
          url,
          async,
          username ?? null,
          password ?? null,
        ]);
      };
    const guardedSend: typeof XMLHttpRequest.prototype.send =
      function guardedSend(
        this: XMLHttpRequest,
        body?: Document | XMLHttpRequestBodyInit | null,
      ): void {
        const request = state.xhrMethods.get(this) ?? {
          method: "GET",
          url: null,
        };
        const bodyText =
          typeof body === "string"
            ? body
            : typeof URLSearchParams !== "undefined" &&
                body instanceof URLSearchParams
              ? body.toString()
              : null;
        const bodyOpaque = body != null && bodyText === null;
        if (
          !isPageOwnedRead(request.method, request.url, bodyText) &&
          !canAllowIntermediateRequest({
            bodyText,
            kind: "xhr",
            method: request.method,
            url: request.url,
          })
        ) {
          recordBlockedAttempt(
            "xhr",
            request.method,
            request.url,
            bodyOpaque
              ? undefined
              : requestCarriesPreparedValue(request.url, bodyText),
          );
          throw new DOMException(
            "Prepare-only mode blocked a new XMLHttpRequest while field mutations were unauthorized.",
            "AbortError",
          );
        }
        originalSend.call(this, body ?? null);
      };
    XMLHttpRequest.prototype.open = guardedOpen;
    XMLHttpRequest.prototype.send = guardedSend;
    state.xhrOpenWrapper = guardedOpen;
    state.xhrSendWrapper = guardedSend;
  }

  if (typeof WebSocket === "function" && WebSocket !== state.webSocketWrapper) {
    const OriginalWebSocket = WebSocket;
    const GuardedWebSocket = function GuardedWebSocket(
      url: string | URL,
      protocols?: string | string[],
    ): WebSocket {
      void protocols;
      recordBlockedAttempt(
        "websocket",
        "GET",
        normalizeUrl(url),
        requestCarriesPreparedValue(normalizeUrl(url), null),
      );
      throw new DOMException(
        "Prepare-only mode blocked a new WebSocket connection.",
        "AbortError",
      );
    } as unknown as typeof WebSocket;
    Object.defineProperty(GuardedWebSocket, "prototype", {
      value: OriginalWebSocket.prototype,
    });
    Object.assign(GuardedWebSocket, {
      CONNECTING: OriginalWebSocket.CONNECTING,
      OPEN: OriginalWebSocket.OPEN,
      CLOSING: OriginalWebSocket.CLOSING,
      CLOSED: OriginalWebSocket.CLOSED,
    });
    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      value: GuardedWebSocket,
      writable: true,
    });
    state.webSocketWrapper = GuardedWebSocket;
  }

  if (
    typeof EventSource === "function" &&
    EventSource !== state.eventSourceWrapper
  ) {
    const OriginalEventSource = EventSource;
    const GuardedEventSource = function GuardedEventSource(
      url: string | URL,
      eventSourceInit?: EventSourceInit,
    ): EventSource {
      void eventSourceInit;
      recordBlockedAttempt(
        "eventsource",
        "GET",
        normalizeUrl(url),
        requestCarriesPreparedValue(normalizeUrl(url), null),
      );
      throw new DOMException(
        "Prepare-only mode blocked a new EventSource stream.",
        "AbortError",
      );
    } as unknown as typeof EventSource;
    Object.defineProperty(GuardedEventSource, "prototype", {
      value: OriginalEventSource.prototype,
    });
    Object.defineProperty(window, "EventSource", {
      configurable: true,
      value: GuardedEventSource,
      writable: true,
    });
    state.eventSourceWrapper = GuardedEventSource;
  }

  const originalWebTransport = pageWindow["WebTransport"];
  if (
    typeof originalWebTransport === "function" &&
    originalWebTransport !== state.webTransportWrapper
  ) {
    const OriginalWebTransport =
      originalWebTransport as WebTransportPageConstructor;
    const GuardedWebTransport = function GuardedWebTransport(
      url: string | URL,
    ): unknown {
      recordBlockedAttempt(
        "webtransport",
        "GET",
        normalizeUrl(url),
        requestCarriesPreparedValue(normalizeUrl(url), null),
      );
      throw new DOMException(
        "Prepare-only mode blocked a new WebTransport session.",
        "AbortError",
      );
    } as unknown as WebTransportPageConstructor;
    Object.defineProperty(GuardedWebTransport, "prototype", {
      value: (OriginalWebTransport as unknown as { prototype: unknown })
        .prototype,
    });
    Object.defineProperty(window, "WebTransport", {
      configurable: true,
      value: GuardedWebTransport,
      writable: true,
    });
    state.webTransportWrapper = GuardedWebTransport;
  }

  if (
    typeof window.open === "function" &&
    window.open !== state.windowOpenWrapper
  ) {
    const guardedWindowOpen: typeof window.open = (
      url?,
      target?,
      features?,
    ) => {
      void target;
      void features;
      recordBlockedAttempt(
        "window_open",
        "GET",
        url === undefined || String(url).trim() === ""
          ? normalizeUrl(window.location.href)
          : normalizeUrl(url),
      );
      return null;
    };
    Object.defineProperty(window, "open", {
      configurable: true,
      value: guardedWindowOpen,
      writable: true,
    });
    state.windowOpenWrapper = guardedWindowOpen;
  }
}

/** Runs inside the application page to open or close one bounded field window. */
export function setPrepareOnlyIntermediateMutationWindowInPage(
  mutationWindow: IntermediateMutationWindowSnapshot | null,
): void {
  const pageWindow = window as unknown as Record<string, unknown>;
  const state = pageWindow["__unemployedPrepareOnlyMutationGuardV1"] as
    | {
        intermediateMutationWindow: IntermediateMutationWindowSnapshot | null;
      }
    | undefined;
  if (!state) {
    throw new Error("Prepare-only mutation guard is not installed.");
  }
  state.intermediateMutationWindow = mutationWindow
    ? { ...mutationWindow }
    : null;
}

/** Runs inside the application page and returns only serializable guard data. */
export function readPrepareOnlyMutationGuardInPage(): PrepareOnlyGuardSnapshot {
  const pageWindow = window as unknown as Record<string, unknown>;
  const state = pageWindow["__unemployedPrepareOnlyMutationGuardV1"] as
    | PrepareOnlyGuardSnapshot
    | undefined;

  return {
    installed: state?.installed === true,
    blockedAttempts: [...(state?.blockedAttempts ?? [])],
  };
}

export interface ServiceWorkerRegisterGuardStatus {
  supported: boolean;
  prototypeGuardInstalled: boolean;
  instanceGuardInstalled: boolean;
  integrityVerified: boolean;
  guardStatePresent: boolean;
  blockedRegistrationAttempts: number;
}

/**
 * Runs inside every document of the managed context before site scripts. The
 * register replacement is installed non-configurable and non-writable on both
 * the ServiceWorkerContainer prototype and the container instance so site
 * scripts cannot delete, shadow, or restore it. Re-running the installer is
 * idempotent: an existing hardened descriptor is verified instead of replaced.
 */
export function installServiceWorkerRegisterGuardInPage(): void {
  const pageWindow = window as unknown as Record<string, unknown>;
  const stateKey = "__unemployedServiceWorkerRegisterGuardV1";
  type InstallState = ServiceWorkerRegisterGuardStatus;

  const existingState = pageWindow[stateKey] as InstallState | undefined;
  const state: InstallState = existingState ?? {
    supported: false,
    prototypeGuardInstalled: false,
    instanceGuardInstalled: false,
    integrityVerified: false,
    guardStatePresent: true,
    blockedRegistrationAttempts: 0,
  };
  try {
    Object.defineProperty(pageWindow, stateKey, {
      value: state,
      writable: false,
      enumerable: false,
      configurable: false,
    });
  } catch {
    // The state anchor already exists from a prior installation pass.
  }

  if (!navigator.serviceWorker || !navigator.serviceWorker.register) {
    // Truthful feature absence: without a reachable registration API there is
    // nothing to guard and nothing to claim.
    state.supported = false;
    state.prototypeGuardInstalled = true;
    state.instanceGuardInstalled = true;
    state.integrityVerified = true;
    return;
  }

  const installOn = (target: object): boolean => {
    const existing = Object.getOwnPropertyDescriptor(target, "register");
    if (
      existing &&
      existing.configurable === false &&
      existing.writable === false &&
      typeof existing.value === "function"
    ) {
      return true;
    }
    const guard = function register(): Promise<never> {
      state.blockedRegistrationAttempts += 1;
      console.warn(
        "Service Worker registration blocked by UnEmployed managed browser.",
      );
      return Promise.reject(
        new DOMException(
          "Service Worker registration is disabled in the UnEmployed managed browser.",
          "NotAllowedError",
        ),
      );
    };
    try {
      Object.defineProperty(target, "register", {
        value: guard,
        writable: false,
        enumerable: true,
        configurable: false,
      });
    } catch {
      return false;
    }
    const descriptor = Object.getOwnPropertyDescriptor(target, "register");
    return Boolean(
      descriptor &&
      descriptor.configurable === false &&
      descriptor.writable === false &&
      descriptor.value === guard,
    );
  };

  state.supported = true;
  let prototype: object | null = null;
  try {
    prototype = Object.getPrototypeOf(navigator.serviceWorker) as object | null;
  } catch {
    prototype = null;
  }
  state.prototypeGuardInstalled = prototype ? installOn(prototype) : false;
  state.instanceGuardInstalled = installOn(navigator.serviceWorker);
  state.integrityVerified =
    state.prototypeGuardInstalled && state.instanceGuardInstalled;
}

/** Runs inside the application page and returns only serializable status. */
export function readServiceWorkerRegisterGuardInPage(): ServiceWorkerRegisterGuardStatus {
  const pageWindow = window as unknown as Record<string, unknown>;
  const state = pageWindow["__unemployedServiceWorkerRegisterGuardV1"] as
    | ServiceWorkerRegisterGuardStatus
    | undefined;
  const container =
    typeof navigator !== "undefined" && navigator.serviceWorker
      ? navigator.serviceWorker
      : null;
  if (!container || !navigator.serviceWorker.register) {
    return {
      supported: false,
      prototypeGuardInstalled: true,
      instanceGuardInstalled: true,
      integrityVerified: true,
      guardStatePresent: state?.guardStatePresent === true,
      blockedRegistrationAttempts: state?.blockedRegistrationAttempts ?? 0,
    };
  }

  const describeOwn = (target: object): boolean => {
    const descriptor = Object.getOwnPropertyDescriptor(target, "register");
    return Boolean(
      descriptor &&
      descriptor.configurable === false &&
      descriptor.writable === false &&
      typeof descriptor.value === "function",
    );
  };
  let prototype: object | null = null;
  try {
    prototype = Object.getPrototypeOf(container) as object | null;
  } catch {
    prototype = null;
  }
  const prototypeGuardInstalled = prototype ? describeOwn(prototype) : false;
  const instanceGuardInstalled = describeOwn(container);

  return {
    supported: true,
    prototypeGuardInstalled,
    instanceGuardInstalled,
    integrityVerified:
      state !== undefined &&
      state.supported === true &&
      state.integrityVerified === true &&
      prototypeGuardInstalled &&
      instanceGuardInstalled,
    guardStatePresent: state !== undefined,
    blockedRegistrationAttempts:
      typeof state?.blockedRegistrationAttempts === "number"
        ? state.blockedRegistrationAttempts
        : 0,
  };
}

export interface PageServiceWorkerScanPayload {
  scanned: boolean;
  controllerUrl: string | null;
  registrations: Array<{
    scope: string;
    installingUrl: string | null;
    waitingUrl: string | null;
    activeUrl: string | null;
  }>;
}

/**
 * Runs inside the application page main frame; returns serializable state.
 * Self-contained on purpose: Playwright serializes only this function body,
 * so it must not reference other module functions.
 */
export function collectApplicationOriginServiceWorkerStateInPage(): Promise<PageServiceWorkerScanPayload> {
  const emptyPayload = (): PageServiceWorkerScanPayload => ({
    scanned: false,
    controllerUrl: null,
    registrations: [],
  });
  if (!window.navigator.serviceWorker) {
    return Promise.resolve(emptyPayload());
  }

  const serviceWorker = window.navigator.serviceWorker;
  return serviceWorker
    .getRegistrations()
    .then((registrations) => ({
      scanned: true,
      controllerUrl: serviceWorker.controller?.scriptURL ?? null,
      registrations: registrations.map((registration) => ({
        scope: registration.scope,
        installingUrl: registration.installing?.scriptURL ?? null,
        waitingUrl: registration.waiting?.scriptURL ?? null,
        activeUrl: registration.active?.scriptURL ?? null,
      })),
    }))
    .catch(() => emptyPayload());
}

interface InspectedFormControl {
  index: number;
  tagName: "input" | "textarea" | "select" | "contenteditable";
  inputType: string;
  role: string;
  id: string;
  name: string;
  label: string;
  groupLabel: string;
  placeholder: string;
  autocomplete: string;
  required: boolean;
  invalid: boolean;
  validationMessage: string;
  disabled: boolean;
  readOnly: boolean;
  visible: boolean;
  value: string;
  checked: boolean;
  multiple: boolean;
  options: string[];
  selectedOptionLabel: string;
}

interface InspectedActionControl {
  index: number;
  label: string;
  type: string;
  visible: boolean;
  disabled: boolean;
  /** An http(s) destination when the control is a link; opening it is a navigation, not an action. */
  href?: string | null;
}

interface ApplicationPageInspection {
  url: string | null;
  title: string | null;
  bodyText: string;
  frameHints: string[];
  controls: InspectedFormControl[];
  actions: InspectedActionControl[];
}

interface GroundedControlAnswer {
  value: string;
  optionCountryHint?: string;
  fileName?: string;
  fileMime?: string;
  loadFileBytes?: () => Promise<Uint8Array>;
  kind: ApplicationAttemptQuestion["kind"];
  sourceKind: "profile" | "resume" | "user";
  sourceId: string;
  provenanceLabel: string;
}

interface DetectedPageBlocker {
  code: ApplicationAttemptBlocker["code"];
  summary: string;
  detail: string;
  nextActionLabel: string;
}

type GroundedControlFillResult =
  | "filled"
  | "already_matches"
  | "mismatch"
  | "unsupported";

function createControlSemanticSignature(control: InspectedFormControl): string {
  return JSON.stringify([
    control.tagName,
    control.inputType,
    control.role,
    control.id,
    control.name,
    control.label,
    control.groupLabel,
    control.placeholder,
    control.autocomplete,
  ]);
}

function createActionSemanticSignature(action: InspectedActionControl): string {
  return JSON.stringify([normalizeControlSignal(action.label), action.type]);
}

async function ensureFramePrepareOnlyMutationGuard(
  frame: Frame,
  intermediateMutationsAuthorized: boolean,
): Promise<PrepareOnlyGuardSnapshot> {
  await frame.evaluate(
    installPrepareOnlyMutationGuardInPage,
    intermediateMutationsAuthorized,
  );
  const snapshot = await frame.evaluate(readPrepareOnlyMutationGuardInPage);
  if (!snapshot.installed) {
    throw new Error(
      "The prepare-only browser guard could not be verified in the application frame.",
    );
  }
  return snapshot;
}

export async function ensurePrepareOnlyMutationGuard(
  page: Page,
  intermediateMutationsAuthorized: boolean,
  intermediateMutationAllowedOrigins: readonly string[] = [],
): Promise<PrepareOnlyGuardSnapshot> {
  let networkGuardState = prepareOnlyNetworkGuardStates.get(page);
  if (!networkGuardState) {
    networkGuardState = {
      blockedAttempts: [],
      allowedIntermediateRequests: new WeakSet<Request>(),
      verifiedIntermediateWriteCount: 0,
      intermediateMutationsAuthorized,
      intermediateMutationAllowedOrigins: [
        ...new Set(intermediateMutationAllowedOrigins),
      ],
      intermediateMutationWindow: null,
      initScriptInstalled: false,
      serviceWorkerInitScriptInstalled: false,
      responseListenerInstalled: false,
      webSocketListenerInstalled: false,
    };
    prepareOnlyNetworkGuardStates.set(page, networkGuardState);
    await page.route("**/*", async (route) => {
      const request = route.request();
      const method = request.method().trim().toUpperCase();
      const resourceType = request.resourceType();

      const denyRequest = async (): Promise<void> => {
        networkGuardState!.blockedAttempts.push({
          kind: "network_request",
          method,
          url: request.url(),
          at: new Date().toISOString(),
        });
        networkGuardState!.blockedAttempts.splice(
          0,
          Math.max(0, networkGuardState!.blockedAttempts.length - 32),
        );
        await route.abort("blockedbyclient");
      };

      if (
        (PREPARE_ONLY_SAFE_METHODS.has(method) &&
          !PREPARE_ONLY_DENIED_RESOURCE_TYPES.has(resourceType) &&
          !(
            PREPARE_ONLY_QUERY_GUARDED_RESOURCE_TYPES.has(resourceType) &&
            request.url().includes("?")
          )) ||
        isNetworkLayerPageOwnedRead(request)
      ) {
        await route.continue();
        return;
      }

      const resourceKind: IntermediateMutationResourceKind =
        resourceType === "fetch" || resourceType === "xhr"
          ? resourceType
          : "other";
      const decision = classifyIntermediateMutationRequest({
        authorized: networkGuardState!.intermediateMutationsAuthorized,
        bodyText: request.postData(),
        method,
        nowMs: Date.now(),
        resourceKind,
        url: request.url(),
        window: networkGuardState!.intermediateMutationWindow,
      });
      if (decision.allowed) {
        networkGuardState!.intermediateMutationWindow!.remainingRequests -= 1;
        networkGuardState!.allowedIntermediateRequests.add(request);
        await route.continue();
        return;
      }

      await denyRequest();
    });
  }
  networkGuardState.intermediateMutationsAuthorized =
    intermediateMutationsAuthorized;
  networkGuardState.intermediateMutationAllowedOrigins = [
    ...new Set(intermediateMutationAllowedOrigins),
  ];

  if (!networkGuardState.initScriptInstalled) {
    await page.addInitScript(installPrepareOnlyMutationGuardInPage, false);
    networkGuardState.initScriptInstalled = true;
  }
  if (!networkGuardState.serviceWorkerInitScriptInstalled) {
    await page.addInitScript(installServiceWorkerRegisterGuardInPage);
    networkGuardState.serviceWorkerInitScriptInstalled = true;
  }
  if (!networkGuardState.responseListenerInstalled) {
    page.on("response", (response) => {
      const request = response.request();
      if (
        networkGuardState.allowedIntermediateRequests.has(request) &&
        response.status() >= 200 &&
        response.status() < 400
      ) {
        networkGuardState.allowedIntermediateRequests.delete(request);
        networkGuardState.verifiedIntermediateWriteCount += 1;
      }
    });
    networkGuardState.responseListenerInstalled = true;
  }
  if (!networkGuardState.webSocketListenerInstalled) {
    page.on("websocket", (webSocket) => {
      networkGuardState.blockedAttempts.push({
        kind: "websocket",
        method: "GET",
        url: webSocket.url(),
        at: new Date().toISOString(),
      });
      networkGuardState.blockedAttempts.splice(
        0,
        Math.max(0, networkGuardState.blockedAttempts.length - 32),
      );
    });
    networkGuardState.webSocketListenerInstalled = true;
  }

  const blockedAttempts: PrepareOnlyBlockedAttempt[] = [
    ...networkGuardState.blockedAttempts,
  ];
  for (const frame of page.frames()) {
    let snapshot: PrepareOnlyGuardSnapshot;
    try {
      snapshot = await ensureFramePrepareOnlyMutationGuard(
        frame,
        intermediateMutationsAuthorized,
      );
    } catch (error) {
      throw new Error(
        `The prepare-only browser guard could not be verified in application frame '${
          frame.url() || "(unknown)"
        }': ${describeUnknownError(error, "Unknown frame guard failure.")}`,
      );
    }
    blockedAttempts.push(...snapshot.blockedAttempts);
  }

  return {
    installed: true,
    blockedAttempts,
  };
}

async function setPrepareOnlyIntermediateMutationWindow(
  page: Page,
  mutationWindow: IntermediateMutationWindowSnapshot | null,
): Promise<void> {
  const networkGuardState = prepareOnlyNetworkGuardStates.get(page);
  if (!networkGuardState) {
    throw new Error("Prepare-only network guard is not installed.");
  }
  networkGuardState.intermediateMutationWindow = mutationWindow
    ? { ...mutationWindow }
    : null;
  try {
    for (const frame of page.frames()) {
      await frame.evaluate(
        setPrepareOnlyIntermediateMutationWindowInPage,
        mutationWindow,
      );
    }
  } catch (error) {
    networkGuardState.intermediateMutationWindow = null;
    throw error;
  }
}

export async function openPrepareOnlyIntermediateMutationWindow(
  page: Page,
): Promise<void> {
  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(page.url()).origin;
  } catch {
    throw new Error(
      "Application origin is unavailable for a field-save window.",
    );
  }
  const networkGuardState = prepareOnlyNetworkGuardStates.get(page);
  if (
    !networkGuardState?.intermediateMutationsAuthorized ||
    !networkGuardState.intermediateMutationAllowedOrigins.includes(
      expectedOrigin,
    )
  ) {
    throw new Error(
      "The current application origin is outside the explicit intermediate-mutation authority.",
    );
  }
  await setPrepareOnlyIntermediateMutationWindow(page, {
    expectedOrigin,
    expiresAtMs: Date.now() + INTERMEDIATE_MUTATION_WINDOW_DURATION_MS,
    remainingRequests: INTERMEDIATE_MUTATION_WINDOW_MAX_REQUESTS,
  });
}

export async function closePrepareOnlyIntermediateMutationWindow(
  page: Page,
): Promise<void> {
  await setPrepareOnlyIntermediateMutationWindow(page, null);
}

function getVerifiedIntermediateWriteCount(page: Page): number {
  return (
    prepareOnlyNetworkGuardStates.get(page)?.verifiedIntermediateWriteCount ?? 0
  );
}

export async function getLatestBlockedPrepareOnlyAttempt(
  page: Page,
): Promise<PrepareOnlyBlockedAttempt | null> {
  const ledger: PrepareOnlyBlockedAttempt[] = [
    ...(prepareOnlyNetworkGuardStates.get(page)?.blockedAttempts ?? []),
  ];
  for (const frame of page.frames()) {
    const snapshot = await frame.evaluate(readPrepareOnlyMutationGuardInPage);
    ledger.push(...snapshot.blockedAttempts);
  }
  return ledger.at(-1) ?? null;
}

/**
 * Records an out-of-band prepare-only interruption (popup, download, or
 * context-level network denial) into the page-scoped guard ledger so the
 * existing verification gates escalate it into a manual-review stop.
 */
export function recordPrepareOnlyRunInterruption(
  page: Page,
  attempt: PrepareOnlyBlockedAttempt,
): void {
  let ledgerState = prepareOnlyNetworkGuardStates.get(page);
  if (!ledgerState) {
    const createdState = {
      blockedAttempts: [],
      allowedIntermediateRequests: new WeakSet<Request>(),
      verifiedIntermediateWriteCount: 0,
      intermediateMutationsAuthorized: false,
      intermediateMutationAllowedOrigins: [],
      intermediateMutationWindow: null,
      initScriptInstalled: false,
      serviceWorkerInitScriptInstalled: false,
      responseListenerInstalled: false,
      webSocketListenerInstalled: false,
    };
    prepareOnlyNetworkGuardStates.set(page, createdState);
    ledgerState = createdState;
  }
  ledgerState.blockedAttempts.push(attempt);
  ledgerState.blockedAttempts.splice(
    0,
    Math.max(0, ledgerState.blockedAttempts.length - 32),
  );
}

export type ServiceWorkerSafetyStopReason =
  | "active_service_worker_controlling_application_origin"
  | "service_worker_origin_unresolved"
  | "application_origin_registration_detected"
  | "register_guard_compromised"
  | "service_worker_safety_channel_unavailable";

export type ServiceWorkerSafetyDetectionChannel =
  | "context_serviceworker_event"
  | "context_service_workers_enumeration"
  | "page_service_worker_scan"
  | "register_guard_integrity";

export interface ServiceWorkerSafetyFinding {
  reason: ServiceWorkerSafetyStopReason;
  channel: ServiceWorkerSafetyDetectionChannel;
  phase: string;
  workerUrls: string[];
  detail: string;
}

function parseHttpOriginOrNull(urlString: string): string | null {
  try {
    const url = new URL(urlString);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function describeServiceWorkerFinding(input: {
  reason: ServiceWorkerSafetyStopReason;
  channel: ServiceWorkerSafetyDetectionChannel;
  phase: string;
  workerUrls: readonly string[];
}): string {
  const workerDescription =
    input.workerUrls.length > 0
      ? input.workerUrls.join(", ")
      : "an unnamed service worker";
  switch (input.reason) {
    case "active_service_worker_controlling_application_origin":
      return `An active service worker (${workerDescription}) can control the application origin during the '${input.phase}' phase (detected through ${input.channel}).`;
    case "service_worker_origin_unresolved":
      return `A service worker (${workerDescription}) with an origin that cannot be safely determined was detected during the '${input.phase}' phase (detected through ${input.channel}).`;
    case "application_origin_registration_detected":
      return `A registered service worker (${workerDescription}) exists for the application origin during the '${input.phase}' phase (detected through ${input.channel}), so the run stopped before it could activate and claim the application page.`;
    case "register_guard_compromised":
      return `The in-page service-worker registration guard failed verification during the '${input.phase}' phase (detected through ${input.channel}).`;
    case "service_worker_safety_channel_unavailable":
      return `Continuous service-worker safety verification was unavailable during the '${input.phase}' phase (detected through ${input.channel}).`;
  }
}

function classifyServiceWorkerUrlsAgainstOrigin(input: {
  workerUrls: readonly string[];
  targetOrigin: string | null;
}): { controllingUrls: string[]; unresolvedUrls: string[] } {
  const controllingUrls: string[] = [];
  const unresolvedUrls: string[] = [];
  for (const workerUrl of input.workerUrls) {
    const workerOrigin = parseHttpOriginOrNull(workerUrl);
    if (!workerOrigin || !input.targetOrigin) {
      unresolvedUrls.push(workerUrl);
    } else if (workerOrigin === input.targetOrigin) {
      controllingUrls.push(workerUrl);
    }
  }
  return { controllingUrls, unresolvedUrls };
}

function findingFromServiceWorkerUrls(input: {
  reason: ServiceWorkerSafetyStopReason;
  channel: ServiceWorkerSafetyDetectionChannel;
  phase: string;
  workerUrls: readonly string[];
}): ServiceWorkerSafetyFinding | null {
  if (input.workerUrls.length === 0) {
    return null;
  }
  const workerUrls = [...input.workerUrls];
  return {
    reason: input.reason,
    channel: input.channel,
    phase: input.phase,
    workerUrls,
    detail: describeServiceWorkerFinding({
      reason: input.reason,
      channel: input.channel,
      phase: input.phase,
      workerUrls,
    }),
  };
}

/**
 * Verifies that no active or registered same-origin (or unresolvable) service
 * worker can influence the application origin right now. Cross-origin workers
 * are intentionally ignored so unrelated origins keep working. Returns a
 * safety finding instead of throwing so every checkpoint can return a
 * truthful manual-review stop with zero further field or click actions.
 */
export async function findApplicationOriginServiceWorkerIssue(input: {
  context: BrowserContext;
  targetUrl: string;
  page?: Page | null;
  phase: string;
  pendingWorkerEventUrls?: readonly string[];
}): Promise<ServiceWorkerSafetyFinding | null> {
  const targetOrigin = parseHttpOriginOrNull(input.targetUrl);

  const relevantEventUrls = (input.pendingWorkerEventUrls ?? []).filter(
    (workerUrl) => {
      const { controllingUrls, unresolvedUrls } =
        classifyServiceWorkerUrlsAgainstOrigin({
          workerUrls: [workerUrl],
          targetOrigin,
        });
      return controllingUrls.length > 0 || unresolvedUrls.length > 0;
    },
  );
  const eventFinding = findingFromServiceWorkerUrls({
    reason: "active_service_worker_controlling_application_origin",
    channel: "context_serviceworker_event",
    phase: input.phase,
    workerUrls: relevantEventUrls,
  });
  if (eventFinding) {
    return eventFinding;
  }

  if (typeof input.context.serviceWorkers !== "function") {
    return {
      reason: "service_worker_safety_channel_unavailable",
      channel: "context_service_workers_enumeration",
      phase: input.phase,
      workerUrls: [],
      detail: `Active service workers could not be inspected on the managed browser context during the '${input.phase}' phase.`,
    };
  }
  let activeWorkers;
  try {
    activeWorkers = input.context.serviceWorkers();
  } catch (error) {
    return {
      reason: "service_worker_safety_channel_unavailable",
      channel: "context_service_workers_enumeration",
      phase: input.phase,
      workerUrls: [],
      detail: `Active service workers could not be inspected on the managed browser context during the '${input.phase}' phase: ${
        error instanceof Error ? error.message : "unknown inspection error"
      }.`,
    };
  }
  const { controllingUrls, unresolvedUrls } =
    classifyServiceWorkerUrlsAgainstOrigin({
      workerUrls: activeWorkers.map((worker) => worker.url()),
      targetOrigin,
    });
  const enumerationFinding =
    findingFromServiceWorkerUrls({
      reason: "active_service_worker_controlling_application_origin",
      channel: "context_service_workers_enumeration",
      phase: input.phase,
      workerUrls: controllingUrls,
    }) ??
    findingFromServiceWorkerUrls({
      reason: "service_worker_origin_unresolved",
      channel: "context_service_workers_enumeration",
      phase: input.phase,
      workerUrls: unresolvedUrls,
    });
  if (enumerationFinding) {
    return enumerationFinding;
  }

  if (!input.page || typeof input.page.evaluate !== "function") {
    return null;
  }
  let scanPayload: PageServiceWorkerScanPayload;
  try {
    scanPayload = await input.page.evaluate(
      collectApplicationOriginServiceWorkerStateInPage,
    );
  } catch (error) {
    return {
      reason: "service_worker_safety_channel_unavailable",
      channel: "page_service_worker_scan",
      phase: input.phase,
      workerUrls: [],
      detail: `The application page service-worker scan could not be completed during the '${input.phase}' phase: ${
        error instanceof Error ? error.message : "unknown scan error"
      }.`,
    };
  }
  let registerGuard: ServiceWorkerRegisterGuardStatus;
  try {
    registerGuard = await input.page.evaluate(
      readServiceWorkerRegisterGuardInPage,
    );
  } catch {
    registerGuard = {
      supported: true,
      prototypeGuardInstalled: false,
      instanceGuardInstalled: false,
      integrityVerified: false,
      guardStatePresent: false,
      blockedRegistrationAttempts: 0,
    };
  }

  const scannedUrls = [
    ...(scanPayload.controllerUrl ? [scanPayload.controllerUrl] : []),
    ...scanPayload.registrations.flatMap((registration) =>
      [
        registration.scope,
        registration.installingUrl,
        registration.waitingUrl,
        registration.activeUrl,
      ].filter((url): url is string => Boolean(url)),
    ),
  ];
  const registeredSameOriginUrls = scannedUrls.filter((url) => {
    const urlOrigin = parseHttpOriginOrNull(url);
    return Boolean(targetOrigin && urlOrigin && urlOrigin === targetOrigin);
  });
  const scannedUnresolvedUrls = scannedUrls.filter(
    (url) => !parseHttpOriginOrNull(url),
  );
  const scanFinding =
    findingFromServiceWorkerUrls({
      reason: "active_service_worker_controlling_application_origin",
      channel: "page_service_worker_scan",
      phase: input.phase,
      workerUrls: registeredSameOriginUrls,
    }) ??
    findingFromServiceWorkerUrls({
      reason: "service_worker_origin_unresolved",
      channel: "page_service_worker_scan",
      phase: input.phase,
      workerUrls: scannedUnresolvedUrls,
    });
  if (scanFinding) {
    return scanFinding;
  }

  if (
    registerGuard.supported &&
    registerGuard.guardStatePresent &&
    !registerGuard.integrityVerified
  ) {
    return {
      reason: "register_guard_compromised",
      channel: "register_guard_integrity",
      phase: input.phase,
      workerUrls: [],
      detail: describeServiceWorkerFinding({
        reason: "register_guard_compromised",
        channel: "register_guard_integrity",
        phase: input.phase,
        workerUrls: [],
      }),
    };
  }

  return null;
}

export interface ApplicationRunServiceWorkerSentinel {
  check(phase: string): Promise<ServiceWorkerSafetyFinding | null>;
  attachPage(page: Page): void;
  pendingWorkerEventCount(): number;
  detach(): void;
}

/**
 * Run-scoped service-worker sentinel plus popup/download/network containment
 * for one application-preparation run. A newly created same-origin (or
 * unresolvable) worker aborts the run before further actions; popups opened by
 * the application page are closed immediately; downloads are canceled; and
 * context-level non-safe requests are denied into the same ledger. All
 * listeners are removed by detach().
 */
export function createApplicationRunServiceWorkerSentinel(input: {
  context: BrowserContext;
  targetUrl: string;
  now?: () => Date;
}): ApplicationRunServiceWorkerSentinel {
  const now = input.now ?? (() => new Date());
  const pendingWorkerEvents: string[] = [];
  const pendingInterruptions: PrepareOnlyBlockedAttempt[] = [];
  const detachListeners: Array<() => void> = [];
  let ledgerPage: Page | null = null;
  let eventChannelBroken = false;
  let contextRouteInstalled = false;
  let detached = false;

  const recordInterruption = (attempt: PrepareOnlyBlockedAttempt): void => {
    if (detached) {
      return;
    }
    // Once an application page is attached, interruptions land in its guard
    // ledger immediately so any verification gate escalates them; before that
    // they queue until the first checkpoint or attachment.
    if (ledgerPage) {
      recordPrepareOnlyRunInterruption(ledgerPage, attempt);
      return;
    }
    pendingInterruptions.push(attempt);
  };

  if (typeof input.context.on === "function") {
    try {
      const onServiceWorker = (worker: { url(): string }): void => {
        pendingWorkerEvents.push(worker.url());
      };
      input.context.on("serviceworker" as never, onServiceWorker as never);
      detachListeners.push(() => {
        if (typeof input.context.off === "function") {
          input.context.off("serviceworker" as never, onServiceWorker as never);
        }
      });

      const onPage = (page: Page): void => {
        void (async () => {
          // Only opener-backed popups (window.open/target=_blank) are
          // contained. Pages created without an opener are first-class tabs
          // such as the managed application page itself.
          const opener = await page.opener().catch(() => null);
          if (!opener) {
            return;
          }
          let popupUrl: string | null = null;
          try {
            const candidateUrl = page.url();
            if (isHttpUrlLike(candidateUrl)) {
              popupUrl = candidateUrl;
            } else {
              const openerUrl = opener.url();
              if (openerUrl && isHttpUrlLike(openerUrl)) {
                popupUrl = openerUrl;
              }
            }
          } catch {
            popupUrl = null;
          }
          recordInterruption({
            kind: "popup_open",
            method: "GET",
            url: popupUrl,
            at: now().toISOString(),
          });
          await page.close().catch(() => undefined);
        })();
      };
      input.context.on("page" as never, onPage as never);
      detachListeners.push(() => {
        if (typeof input.context.off === "function") {
          input.context.off("page" as never, onPage as never);
        }
      });
    } catch {
      eventChannelBroken = true;
    }
  }

  const contextRouteHandler = async (route: Route): Promise<void> => {
    const request = route.request();
    const method = request.method().trim().toUpperCase();
    const resourceType = request.resourceType();
    const allowed =
      (PREPARE_ONLY_SAFE_METHODS.has(method) &&
        !PREPARE_ONLY_DENIED_RESOURCE_TYPES.has(resourceType) &&
        !(
          PREPARE_ONLY_QUERY_GUARDED_RESOURCE_TYPES.has(resourceType) &&
          request.url().includes("?")
        )) ||
      isNetworkLayerPageOwnedRead(request);
    if (!allowed) {
      recordInterruption({
        kind: "network_request",
        method,
        url: request.url(),
        at: now().toISOString(),
      });
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  };
  if (typeof input.context.route === "function") {
    try {
      void input.context
        .route("**/*", contextRouteHandler)
        .then(() => {
          contextRouteInstalled = true;
        })
        .catch(() => undefined);
    } catch {
      // Context routing is best-effort hardening; page routing remains active.
    }
  }

  const sentinel: ApplicationRunServiceWorkerSentinel = {
    async check(phase) {
      if (detached) {
        return null;
      }

      while (pendingInterruptions.length > 0) {
        const attempt = pendingInterruptions.shift();
        if (attempt && ledgerPage) {
          recordPrepareOnlyRunInterruption(ledgerPage, attempt);
        } else if (attempt) {
          pendingInterruptions.unshift(attempt);
          break;
        }
      }

      const drainedEvents = pendingWorkerEvents.splice(
        0,
        pendingWorkerEvents.length,
      );

      if (eventChannelBroken) {
        return {
          reason: "service_worker_safety_channel_unavailable",
          channel: "context_serviceworker_event",
          phase,
          workerUrls: [],
          detail: `The managed browser context failed to subscribe to service-worker creation events, so continuous service-worker verification is unavailable.`,
        };
      }

      return findApplicationOriginServiceWorkerIssue({
        context: input.context,
        targetUrl: input.targetUrl,
        page: ledgerPage,
        phase,
        pendingWorkerEventUrls: drainedEvents,
      });
    },
    attachPage(page) {
      if (detached) {
        return;
      }
      ledgerPage = page;
      if (typeof page.on === "function" && typeof page.off === "function") {
        const onDownload = (download: {
          url(): string;
          cancel(): Promise<void>;
        }): void => {
          recordInterruption({
            kind: "download",
            method: "GET",
            url: download.url(),
            at: now().toISOString(),
          });
          void download.cancel().catch(() => undefined);
        };
        try {
          page.on("download" as never, onDownload as never);
          detachListeners.push(() => {
            page.off("download" as never, onDownload as never);
          });
        } catch {
          // Download containment stays best-effort on exotic hosts.
        }
      }
    },
    pendingWorkerEventCount() {
      return pendingWorkerEvents.length;
    },
    detach() {
      if (detached) {
        return;
      }
      detached = true;
      while (detachListeners.length > 0) {
        detachListeners.pop()?.();
      }
      if (
        contextRouteInstalled &&
        typeof input.context.unroute === "function"
      ) {
        void input.context
          .unroute("**/*", contextRouteHandler)
          .catch(() => undefined);
        contextRouteInstalled = false;
      }
      pendingWorkerEvents.length = 0;
      pendingInterruptions.length = 0;
      ledgerPage = null;
    },
  };

  return sentinel;
}

function normalizeControlSignal(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\blinked in\b/gu, "linkedin")
    .trim();
}

export function normalizeFileSystemPath(value: string): string {
  const normalized = resolve(value.trim()).replace(/\\/gu, "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function describeUnknownError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : fallback;
}

async function loadVerifiedResumeBytes(
  resumeArtifact: ExecuteApplicationFlowInput["resumeArtifact"],
): Promise<Uint8Array> {
  const expectedSha256 = resumeArtifact.sha256?.trim().toLowerCase() ?? "";
  if (!expectedSha256) {
    throw new Error(
      "The approved resume has no SHA-256 integrity record. Re-import or re-export it before application preparation.",
    );
  }

  const bytes = await readFile(resumeArtifact.filePath);
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      "The approved resume changed after verification. Re-import or re-export it before application preparation.",
    );
  }
  return bytes;
}

function normalizeTechnicalControlSignal(value: string): string {
  return normalizeControlSignal(value).replace(
    /^(?:candidate|applicant|contact|user)\s+/u,
    "",
  );
}

function hasExactControlSignal(
  control: InspectedFormControl,
  acceptedSignals: ReadonlySet<string>,
): boolean {
  const visibleSignals = [
    control.label,
    control.placeholder,
    control.groupLabel,
  ]
    .map(normalizeControlSignal)
    .filter(Boolean);
  const technicalSignals = [control.name, control.id]
    .map(normalizeTechnicalControlSignal)
    .filter(Boolean);

  return [...visibleSignals, ...technicalSignals].some((signal) =>
    acceptedSignals.has(signal),
  );
}

function createSignalSet(...values: string[]): ReadonlySet<string> {
  return new Set(values.map(normalizeControlSignal));
}

const RESUME_SIGNALS = createSignalSet(
  "resume",
  "resume file",
  "your resume",
  "upload resume",
  "upload your resume",
  "upload a resume",
  "attach resume",
  "attach your resume",
  "resume upload",
  "cv",
  "cv file",
  "upload cv",
  "resume cv",
  "cv resume",
);
const FIRST_NAME_SIGNALS = createSignalSet("first name", "given name");
const LAST_NAME_SIGNALS = createSignalSet(
  "last name",
  "family name",
  "surname",
);
const FULL_NAME_SIGNALS = createSignalSet(
  "full name",
  "legal name",
  "your name",
);
const EMAIL_SIGNALS = createSignalSet(
  "email",
  "email address",
  "contact email",
);
const PHONE_SIGNALS = createSignalSet(
  "phone",
  "phone number",
  "mobile phone",
  "mobile number",
  "telephone",
);
const LOCATION_SIGNALS = createSignalSet(
  "location",
  "current location",
  "home location",
  "from where do you intend to work",
);
const CITY_SIGNALS = createSignalSet("city", "current city");
const COUNTRY_SIGNALS = createSignalSet("country", "current country");
const LINKEDIN_SIGNALS = createSignalSet(
  "linkedin",
  "linkedin url",
  "linkedin profile",
);
const GITHUB_SIGNALS = createSignalSet(
  "github",
  "github url",
  "github profile",
);
const PORTFOLIO_SIGNALS = createSignalSet(
  "portfolio",
  "portfolio url",
  "portfolio website",
);
const WEBSITE_SIGNALS = createSignalSet(
  "personal website",
  "personal website url",
  "website",
  "website url",
);
const WORK_AUTHORIZATION_SIGNALS = createSignalSet(
  "work authorization",
  "work authorization status",
  "are you authorized to work",
  "are you legally authorized to work",
  "are you authorized to work in this country",
  "are you legally authorized to work in this country",
  "are you legally authorized to work in the country where this position is located",
);
const AUTHORIZED_WORK_COUNTRIES_SIGNALS = createSignalSet(
  "authorized work countries",
  "countries authorized to work in",
  "countries you are authorized to work in",
  "which countries are you authorized to work in",
);
const VISA_SPONSORSHIP_SIGNALS = createSignalSet(
  "visa sponsorship",
  "do you require visa sponsorship",
  "will you require visa sponsorship",
  "will you now or in the future require visa sponsorship",
  "will you now or at any time in the future require visa sponsorship",
  "will you now or in the future require sponsorship for employment visa status",
);
const SALARY_EXPECTATION_SIGNALS = createSignalSet(
  "salary expectation",
  "salary expectations",
  "desired salary",
  "expected salary",
  "compensation expectation",
  "compensation expectations",
  "desired compensation",
  "what are your salary expectations",
);
const AVAILABILITY_SIGNALS = createSignalSet(
  "availability",
  "available start date",
  "earliest start date",
  "start date",
  "when can you start",
  "when are you available to start",
);
const AVAILABLE_START_DATE_SIGNALS = createSignalSet(
  "available start date",
  "earliest start date",
  "start date",
  "when can you start",
  "when are you available to start",
);
const NOTICE_PERIOD_SIGNALS = createSignalSet(
  "notice period",
  "current notice period",
  "notice period days",
  "how much notice do you need to give your current employer",
);
const RELOCATION_SIGNALS = createSignalSet(
  "relocation",
  "willing to relocate",
  "are you willing to relocate",
);
const WILLING_TO_RELOCATE_SIGNALS = createSignalSet(
  "willing to relocate",
  "are you willing to relocate",
);
const TRAVEL_SIGNALS = createSignalSet(
  "travel",
  "willing to travel",
  "are you willing to travel",
);
const WILLING_TO_TRAVEL_SIGNALS = createSignalSet(
  "willing to travel",
  "are you willing to travel",
);
const SELF_INTRODUCTION_SIGNALS = createSignalSet(
  "self introduction",
  "professional introduction",
  "briefly introduce yourself",
  "tell us about yourself",
  "tell me about yourself",
);
const CAREER_TRANSITION_SIGNALS = createSignalSet(
  "career transition",
  "please explain your career transition",
  "why are you changing careers",
  "why are you looking to make a career change",
);

function resolveExactReusableAnswer(input: {
  control: InspectedFormControl;
  profile: CandidateProfile;
  kind: CandidateProfile["answerBank"]["customAnswers"][number]["kind"];
}): string | null {
  const matchingAnswer = input.profile.answerBank.customAnswers.find(
    (answer) =>
      answer.kind === input.kind &&
      [answer.label, answer.question].some((signal) =>
        hasExactControlSignal(input.control, createSignalSet(signal)),
      ),
  );
  return matchingAnswer?.answer.trim() || null;
}

function resolveGroundedAnswerValue(
  control: InspectedFormControl,
  candidates: readonly (string | null | undefined)[],
): string | null {
  const groundedCandidates = candidates
    .map((candidate) => candidate?.trim() ?? "")
    .filter(
      (candidate, index, values) =>
        Boolean(candidate) && values.indexOf(candidate) === index,
    );
  if (groundedCandidates.length === 0) {
    return null;
  }

  if (control.tagName !== "select") {
    return groundedCandidates[0] ?? null;
  }

  return (
    groundedCandidates.find((candidate) => {
      const normalizedCandidate = normalizeControlSignal(candidate);
      return control.options.some(
        (option) => normalizeControlSignal(option) === normalizedCandidate,
      );
    }) ?? null
  );
}

function toYesNoAnswer(value: boolean | null): string | null {
  return value === null ? null : value ? "Yes" : "No";
}

function buildExactProfileAnswer(input: {
  control: InspectedFormControl;
  profile: CandidateProfile;
  signals: ReadonlySet<string>;
  reusableKind: CandidateProfile["answerBank"]["customAnswers"][number]["kind"];
  primaryAnswer: string | null;
  fallbackAnswers?: readonly (string | null | undefined)[];
  questionKind: ApplicationAttemptQuestion["kind"];
  provenanceLabel: string;
}): GroundedControlAnswer | null {
  if (["checkbox", "radio"].includes(input.control.inputType)) {
    return null;
  }
  if (!hasExactControlSignal(input.control, input.signals)) {
    return null;
  }

  const value = resolveGroundedAnswerValue(input.control, [
    input.primaryAnswer,
    resolveExactReusableAnswer({
      control: input.control,
      profile: input.profile,
      kind: input.reusableKind,
    }),
    ...(input.fallbackAnswers ?? []),
  ]);
  if (!value) {
    return null;
  }

  return {
    value,
    kind: input.questionKind,
    sourceKind: "profile",
    sourceId: input.profile.id,
    provenanceLabel: input.provenanceLabel,
  };
}

function isResumeUploadControl(control: InspectedFormControl): boolean {
  if (control.inputType !== "file") {
    return false;
  }

  if (hasExactControlSignal(control, RESUME_SIGNALS)) {
    return true;
  }

  return [
    control.label,
    control.placeholder,
    normalizeTechnicalControlSignal(control.name),
    normalizeTechnicalControlSignal(control.id),
  ]
    .map(normalizeControlSignal)
    .filter(Boolean)
    .some(
      (signal) =>
        /\b(?:resume|cv)\b/u.test(signal) &&
        !/\b(?:cover letter|transcript|portfolio|certificate|work sample)\b/u.test(
          signal,
        ),
    );
}

function isPhoneCountryCodeControl(control: InspectedFormControl): boolean {
  const label = normalizeControlSignal(control.label);
  const groupLabel = normalizeControlSignal(control.groupLabel);
  const signal = normalizeControlSignal(
    [control.label, control.groupLabel, control.name, control.id].join(" "),
  );
  return (
    /\b(?:phone country|country code|calling code|dial code)\b/u.test(signal) ||
    (label === "country" && groupLabel === "phone")
  );
}

function isCustomCombobox(control: InspectedFormControl): boolean {
  return (
    control.tagName !== "select" &&
    (control.role === "combobox" || control.inputType === "combobox")
  );
}

function isCustomPhoneCountryCombobox(control: InspectedFormControl): boolean {
  return isCustomCombobox(control) && isPhoneCountryCodeControl(control);
}

const UNITED_STATES_STRUCTURED_REGION_SIGNALS = createSignalSet(
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "District of Columbia",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
);

function resolvePhoneCountryFromStructuredRegion(
  currentRegion: string | null,
): string | null {
  const normalizedRegion = normalizeControlSignal(currentRegion ?? "");
  if (UNITED_STATES_STRUCTURED_REGION_SIGNALS.has(normalizedRegion)) {
    return "United States";
  }
  return null;
}

function resolvePhoneCountryOptionHint(
  profile: CandidateProfile,
): string | null {
  const currentCountry = profile.currentCountry?.trim() ?? "";
  if (currentCountry) {
    return currentCountry;
  }

  const structuredRegionCountry = resolvePhoneCountryFromStructuredRegion(
    profile.currentRegion,
  );
  if (structuredRegionCountry) {
    return structuredRegionCountry;
  }

  const authorizedCountries = [
    ...new Set(
      profile.workEligibility.authorizedWorkCountries
        .map((country) => country.trim())
        .filter(Boolean),
    ),
  ];
  return authorizedCountries.length === 1
    ? (authorizedCountries[0] ?? null)
    : null;
}

function getPhoneCountryOptionCallingCodes(optionLabel: string): string[] {
  return [...new Set(optionLabel.match(/\+\d{1,4}(?!\d)/gu) ?? [])];
}

function getPhoneCountryOptionCountry(optionLabel: string): string {
  return normalizeControlSignal(optionLabel.replace(/\+\d{1,4}(?!\d)/gu, " "));
}

function extractExplicitPhoneCallingCode(phone: string): string | null {
  const trimmedPhone = phone.trim();
  const standaloneCode = trimmedPhone.match(/^\+\d{1,4}$/u)?.[0] ?? null;
  if (standaloneCode) {
    return standaloneCode;
  }

  return (
    trimmedPhone.match(/^(?:\(\s*)?(\+\d{1,4})(?=\s|\)|[.-])/u)?.[1] ?? null
  );
}

function resolvePreferredPhoneCallingCode(input: {
  phone: string;
  countryHint: string | null;
  optionLabels: readonly string[];
}): string | null {
  const explicitCode = extractExplicitPhoneCallingCode(input.phone);
  if (explicitCode) {
    return explicitCode;
  }

  const compactPhone = input.phone.trim();
  const normalizedCountryHint = normalizeControlSignal(input.countryHint ?? "");
  if (!/^\+\d{7,15}$/u.test(compactPhone) || !normalizedCountryHint) {
    return null;
  }

  const matchingCodes = [
    ...new Set(
      input.optionLabels.flatMap((optionLabel) => {
        if (
          getPhoneCountryOptionCountry(optionLabel) !== normalizedCountryHint
        ) {
          return [];
        }
        return getPhoneCountryOptionCallingCodes(optionLabel).filter((code) =>
          compactPhone.startsWith(code),
        );
      }),
    ),
  ];
  return matchingCodes.length === 1 ? (matchingCodes[0] ?? null) : null;
}

function isPlausiblyCorruptedPhoneCountryValue(value: string): boolean {
  const trimmedValue = value.trim();
  return (
    /^(?:\(\s*)?\+/u.test(trimmedValue) &&
    trimmedValue.replace(/\D/gu, "").length >= 7
  );
}
function phoneCountryOptionMatches(
  optionLabel: string,
  answer: GroundedControlAnswer,
): boolean {
  const callingCode = answer.value.trim().match(/^\+\d{1,4}$/u)?.[0] ?? null;
  const countryHint = normalizeControlSignal(answer.optionCountryHint ?? "");
  if (!callingCode || !countryHint) {
    return false;
  }

  const optionCallingCodes = getPhoneCountryOptionCallingCodes(optionLabel);
  if (!optionCallingCodes.includes(callingCode)) {
    return false;
  }

  return getPhoneCountryOptionCountry(optionLabel) === countryHint;
}

function resolveNativePhoneCountryOption(
  options: readonly string[],
  answer: GroundedControlAnswer,
): string | null {
  const matchingOptions = options.filter((option) =>
    phoneCountryOptionMatches(option, answer),
  );
  return matchingOptions.length === 1 ? (matchingOptions[0] ?? null) : null;
}

interface InspectedCustomComboboxOption {
  index: number;
  label: string;
  visible: boolean;
}

function resolveCustomPhoneCountryOption(
  options: readonly InspectedCustomComboboxOption[],
  answer: GroundedControlAnswer,
): { index: number; label: string } | null {
  const matchingOptions = options.filter(
    (option) =>
      option.visible && phoneCountryOptionMatches(option.label, answer),
  );
  return matchingOptions.length === 1
    ? {
        index: matchingOptions[0]!.index,
        label: matchingOptions[0]!.label,
      }
    : null;
}

function resolveExactCustomComboboxOption(
  options: readonly InspectedCustomComboboxOption[],
  answer: GroundedControlAnswer,
): { index: number; label: string } | null {
  const normalizedAnswer = normalizeControlSignal(answer.value);
  if (!normalizedAnswer) {
    return null;
  }

  const matchingOptions = options.filter(
    (option) =>
      option.visible &&
      normalizeControlSignal(option.label) === normalizedAnswer,
  );
  return matchingOptions.length === 1
    ? {
        index: matchingOptions[0]!.index,
        label: matchingOptions[0]!.label,
      }
    : null;
}

function resolvePreferredProfileLink(
  profile: CandidateProfile,
  kind: "linkedin" | "github" | "portfolio" | "website",
): string | null {
  const preferredLinkIds = new Set(
    profile.applicationIdentity.preferredLinkIds,
  );
  const candidates = profile.links.filter((link) => {
    if (!link.url || link.isDraft) {
      return false;
    }
    const signal = normalizeControlSignal(
      [link.kind, link.label, link.url].filter(Boolean).join(" "),
    );
    return kind === "linkedin"
      ? /\blinkedin\b/u.test(signal)
      : kind === "github"
        ? /\bgithub\b/u.test(signal)
        : kind === "portfolio"
          ? /\b(?:portfolio|case study)\b/u.test(signal)
          : /\b(?:website|personal site)\b/u.test(signal);
  });

  return (
    candidates.find((link) => preferredLinkIds.has(link.id))?.url ??
    candidates[0]?.url ??
    null
  );
}

function stripSelectedCallingCode(
  phone: string,
  controls: readonly InspectedFormControl[],
): string {
  const callingCode = controls
    .filter(isPhoneCountryCodeControl)
    .flatMap((control) =>
      getPhoneCountryOptionCallingCodes(control.selectedOptionLabel),
    )
    .find((value): value is string => Boolean(value));

  if (!callingCode) {
    return phone;
  }

  const escapedCode = callingCode.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const withoutPrefix = phone
    .trim()
    .replace(
      new RegExp(`^(?:\\(\\s*)?${escapedCode}(?:\\s*\\))?[\\s.-]*`, "u"),
      "",
    )
    .trim();
  return withoutPrefix || phone;
}

function getGroundedControlAnswer(input: {
  control: InspectedFormControl;
  controls: readonly InspectedFormControl[];
  applicationAttachments: ExecuteApplicationFlowInput["applicationAttachments"];
  profile: CandidateProfile;
  resumeFilePath: string;
  resumeFileName: string;
  resumeArtifactId: string;
  resumeProvenanceLabel: string;
  loadVerifiedResumeBytes: () => Promise<Uint8Array>;
}): GroundedControlAnswer | null {
  const { control, profile } = input;
  const autocomplete = normalizeControlSignal(control.autocomplete);

  if (isResumeUploadControl(control)) {
    return {
      value: input.resumeFilePath,
      fileName: input.resumeFileName,
      loadFileBytes: input.loadVerifiedResumeBytes,
      kind: "resume",
      sourceKind: "resume",
      sourceId: input.resumeArtifactId,
      provenanceLabel: input.resumeProvenanceLabel,
    };
  }

  if (control.inputType === "file") {
    const normalizedPrompt = normalizeControlSignal(getQuestionPrompt(control));
    const attachmentMatches = (input.applicationAttachments ?? []).filter(
      (attachment) =>
        normalizeControlSignal(attachment.prompt) === normalizedPrompt &&
        attachment.questionKind === inferQuestionKind(control),
    );
    if (attachmentMatches.length === 1) {
      const attachment = attachmentMatches[0]!;
      return {
        value: attachment.assetId,
        fileName: attachment.fileName,
        fileMime: attachment.mime,
        loadFileBytes: attachment.loadVerifiedBytes,
        kind: attachment.questionKind,
        sourceKind: "user",
        sourceId: attachment.assetId,
        provenanceLabel:
          "User-approved candidate asset for this exact question",
      };
    }
  }

  if (
    profile.firstName &&
    (autocomplete === "given name" ||
      hasExactControlSignal(control, FIRST_NAME_SIGNALS))
  ) {
    return {
      value: profile.firstName,
      kind: "personal_info",
      sourceKind: "profile",
      sourceId: profile.id,
      provenanceLabel: "Candidate profile first name",
    };
  }

  if (
    profile.lastName &&
    (autocomplete === "family name" ||
      hasExactControlSignal(control, LAST_NAME_SIGNALS))
  ) {
    return {
      value: profile.lastName,
      kind: "personal_info",
      sourceKind: "profile",
      sourceId: profile.id,
      provenanceLabel: "Candidate profile last name",
    };
  }

  if (
    profile.fullName &&
    (autocomplete === "name" ||
      hasExactControlSignal(control, FULL_NAME_SIGNALS))
  ) {
    return {
      value: profile.fullName,
      kind: "personal_info",
      sourceKind: "profile",
      sourceId: profile.id,
      provenanceLabel: "Candidate profile full name",
    };
  }

  const preferredEmail =
    profile.applicationIdentity.preferredEmail ?? profile.email;
  if (
    preferredEmail &&
    (autocomplete === "email" || hasExactControlSignal(control, EMAIL_SIGNALS))
  ) {
    return {
      value: preferredEmail,
      kind: "personal_info",
      sourceKind: "profile",
      sourceId: profile.id,
      provenanceLabel: "Candidate profile email",
    };
  }

  const preferredPhone =
    profile.applicationIdentity.preferredPhone ?? profile.phone;
  const optionCountryHint = resolvePhoneCountryOptionHint(profile);
  const preferredCallingCode = preferredPhone
    ? resolvePreferredPhoneCallingCode({
        phone: preferredPhone,
        countryHint: optionCountryHint,
        optionLabels: control.options,
      })
    : null;
  if (preferredCallingCode && isPhoneCountryCodeControl(control)) {
    return {
      value: preferredCallingCode,
      ...(optionCountryHint ? { optionCountryHint } : {}),
      kind: "personal_info",
      sourceKind: "profile",
      sourceId: profile.id,
      provenanceLabel: "Candidate profile phone country code",
    };
  }
  if (
    preferredPhone &&
    !isPhoneCountryCodeControl(control) &&
    (autocomplete === "tel" ||
      autocomplete.startsWith("tel ") ||
      hasExactControlSignal(control, PHONE_SIGNALS))
  ) {
    return {
      value: stripSelectedCallingCode(preferredPhone, input.controls),
      kind: "personal_info",
      sourceKind: "profile",
      sourceId: profile.id,
      provenanceLabel: "Candidate profile phone",
    };
  }

  if (
    profile.currentLocation &&
    hasExactControlSignal(control, LOCATION_SIGNALS)
  ) {
    return {
      value: profile.currentLocation,
      kind: "location",
      sourceKind: "profile",
      sourceId: profile.id,
      provenanceLabel: "Candidate profile current location",
    };
  }

  if (profile.currentCity && hasExactControlSignal(control, CITY_SIGNALS)) {
    return {
      value: profile.currentCity,
      kind: "location",
      sourceKind: "profile",
      sourceId: profile.id,
      provenanceLabel: "Candidate profile current city",
    };
  }

  if (
    profile.currentCountry &&
    hasExactControlSignal(control, COUNTRY_SIGNALS)
  ) {
    return {
      value: profile.currentCountry,
      kind: "location",
      sourceKind: "profile",
      sourceId: profile.id,
      provenanceLabel: "Candidate profile current country",
    };
  }

  const linkedinUrl =
    profile.linkedinUrl ?? resolvePreferredProfileLink(profile, "linkedin");
  if (linkedinUrl && hasExactControlSignal(control, LINKEDIN_SIGNALS)) {
    return {
      value: linkedinUrl,
      kind: "portfolio",
      sourceKind: "profile",
      sourceId: profile.id,
      provenanceLabel: "Candidate profile LinkedIn URL",
    };
  }

  const githubUrl =
    profile.githubUrl ?? resolvePreferredProfileLink(profile, "github");
  if (githubUrl && hasExactControlSignal(control, GITHUB_SIGNALS)) {
    return {
      value: githubUrl,
      kind: "portfolio",
      sourceKind: "profile",
      sourceId: profile.id,
      provenanceLabel: "Candidate profile GitHub URL",
    };
  }

  const portfolioUrl =
    profile.portfolioUrl ?? resolvePreferredProfileLink(profile, "portfolio");
  if (portfolioUrl && hasExactControlSignal(control, PORTFOLIO_SIGNALS)) {
    return {
      value: portfolioUrl,
      kind: "portfolio",
      sourceKind: "profile",
      sourceId: profile.id,
      provenanceLabel: "Candidate profile portfolio URL",
    };
  }

  const personalWebsiteUrl =
    profile.personalWebsiteUrl ??
    resolvePreferredProfileLink(profile, "website");
  if (personalWebsiteUrl && hasExactControlSignal(control, WEBSITE_SIGNALS)) {
    return {
      value: personalWebsiteUrl,
      kind: "portfolio",
      sourceKind: "profile",
      sourceId: profile.id,
      provenanceLabel: "Candidate profile personal website URL",
    };
  }

  const workAuthorizationAnswer = buildExactProfileAnswer({
    control,
    profile,
    signals: WORK_AUTHORIZATION_SIGNALS,
    reusableKind: "work_authorization",
    primaryAnswer: profile.answerBank.workAuthorization,
    questionKind: "work_authorization",
    provenanceLabel: "Candidate profile work-authorization answer",
  });
  if (workAuthorizationAnswer) {
    return workAuthorizationAnswer;
  }

  const authorizedCountriesAnswer = buildExactProfileAnswer({
    control,
    profile,
    signals: AUTHORIZED_WORK_COUNTRIES_SIGNALS,
    reusableKind: "work_authorization",
    primaryAnswer: null,
    fallbackAnswers: [
      profile.workEligibility.authorizedWorkCountries.length > 0
        ? profile.workEligibility.authorizedWorkCountries.join(", ")
        : null,
    ],
    questionKind: "work_authorization",
    provenanceLabel: "Candidate profile authorized work countries",
  });
  if (authorizedCountriesAnswer) {
    return authorizedCountriesAnswer;
  }

  const visaSponsorshipAnswer = buildExactProfileAnswer({
    control,
    profile,
    signals: VISA_SPONSORSHIP_SIGNALS,
    reusableKind: "visa_sponsorship",
    primaryAnswer: profile.answerBank.visaSponsorship,
    fallbackAnswers: [
      toYesNoAnswer(profile.workEligibility.requiresVisaSponsorship),
    ],
    questionKind: "visa_sponsorship",
    provenanceLabel: "Candidate profile visa-sponsorship answer",
  });
  if (visaSponsorshipAnswer) {
    return visaSponsorshipAnswer;
  }

  const salaryExpectationAnswer = buildExactProfileAnswer({
    control,
    profile,
    signals: SALARY_EXPECTATION_SIGNALS,
    reusableKind: "salary_expectation",
    primaryAnswer: profile.answerBank.salaryExpectations,
    questionKind: "salary_expectation",
    provenanceLabel: "Candidate profile salary-expectation answer",
  });
  if (salaryExpectationAnswer) {
    return salaryExpectationAnswer;
  }

  const availabilityAnswer = buildExactProfileAnswer({
    control,
    profile,
    signals: AVAILABILITY_SIGNALS,
    reusableKind: "availability",
    primaryAnswer: profile.answerBank.availability,
    fallbackAnswers: [
      hasExactControlSignal(control, AVAILABLE_START_DATE_SIGNALS)
        ? profile.workEligibility.availableStartDate
        : null,
    ],
    questionKind: "availability",
    provenanceLabel: "Candidate profile availability answer",
  });
  if (availabilityAnswer) {
    return availabilityAnswer;
  }

  const noticePeriodDays = profile.workEligibility.noticePeriodDays;
  const noticePeriodAnswer = buildExactProfileAnswer({
    control,
    profile,
    signals: NOTICE_PERIOD_SIGNALS,
    reusableKind: "notice_period",
    primaryAnswer: profile.answerBank.noticePeriod,
    fallbackAnswers: [
      noticePeriodDays === null
        ? null
        : `${noticePeriodDays} ${noticePeriodDays === 1 ? "day" : "days"}`,
    ],
    questionKind: "notice_period",
    provenanceLabel: "Candidate profile notice-period answer",
  });
  if (noticePeriodAnswer) {
    return noticePeriodAnswer;
  }

  const relocationAnswer = buildExactProfileAnswer({
    control,
    profile,
    signals: RELOCATION_SIGNALS,
    reusableKind: "relocation",
    primaryAnswer: profile.answerBank.relocation,
    fallbackAnswers: [
      hasExactControlSignal(control, WILLING_TO_RELOCATE_SIGNALS)
        ? toYesNoAnswer(profile.workEligibility.willingToRelocate)
        : null,
    ],
    questionKind: "relocation",
    provenanceLabel: "Candidate profile relocation answer",
  });
  if (relocationAnswer) {
    return relocationAnswer;
  }

  const travelAnswer = buildExactProfileAnswer({
    control,
    profile,
    signals: TRAVEL_SIGNALS,
    reusableKind: "travel",
    primaryAnswer: profile.answerBank.travel,
    fallbackAnswers: [
      hasExactControlSignal(control, WILLING_TO_TRAVEL_SIGNALS)
        ? toYesNoAnswer(profile.workEligibility.willingToTravel)
        : null,
    ],
    questionKind: "travel",
    provenanceLabel: "Candidate profile travel answer",
  });
  if (travelAnswer) {
    return travelAnswer;
  }

  const selfIntroductionAnswer = buildExactProfileAnswer({
    control,
    profile,
    signals: SELF_INTRODUCTION_SIGNALS,
    reusableKind: "self_intro",
    primaryAnswer: profile.answerBank.selfIntroduction,
    questionKind: "other",
    provenanceLabel: "Candidate profile self-introduction answer",
  });
  if (selfIntroductionAnswer) {
    return selfIntroductionAnswer;
  }

  const careerTransitionAnswer = buildExactProfileAnswer({
    control,
    profile,
    signals: CAREER_TRANSITION_SIGNALS,
    reusableKind: "career_transition",
    primaryAnswer: profile.answerBank.careerTransition,
    questionKind: "other",
    provenanceLabel: "Candidate profile career-transition answer",
  });
  if (careerTransitionAnswer) {
    return careerTransitionAnswer;
  }

  return null;
}

interface InspectedCustomPhoneCountryState {
  selectedOptionLabel: string;
  compositeVisible: boolean;
}

async function inspectCustomPhoneCountryState(input: {
  page: Page;
  control: InspectedFormControl;
}): Promise<InspectedCustomPhoneCountryState> {
  return input.page
    .locator(APPLICATION_FORM_CONTROL_SELECTOR)
    .nth(input.control.index)
    .evaluate((element) => {
      const controlRoot =
        element.closest("[class*='__control']") ??
        element.closest("[class*='-control']") ??
        element.closest(".select-shell, [class*='select-shell']");
      const compositeVisible = Boolean(
        controlRoot &&
        controlRoot.getAttribute("aria-hidden") !== "true" &&
        controlRoot.getAttribute("hidden") === null &&
        controlRoot.getClientRects().length > 0,
      );
      const selectedValue = controlRoot?.querySelector<HTMLElement>(
        "[class*='__single-value'], [class*='-singleValue'], [class*='single-value'], [role='option'][aria-selected='true']",
      );
      if (!selectedValue) {
        return { selectedOptionLabel: "", compositeVisible };
      }

      const selectedText = selectedValue.textContent?.trim() ?? "";
      const countryCode = [
        selectedValue,
        ...Array.from(
          controlRoot?.querySelectorAll<HTMLElement>("[class*='iti__']") ?? [],
        ),
        ...Array.from(selectedValue.querySelectorAll<HTMLElement>("[class]")),
      ]
        .flatMap((candidate) =>
          (candidate.getAttribute("class") ?? "").split(/\s+/u),
        )
        .map((className) => className.match(/^iti__([a-z]{2})$/iu)?.[1] ?? "")
        .find(Boolean);
      if (!countryCode) {
        return { selectedOptionLabel: selectedText, compositeVisible };
      }

      let countryName = "";
      try {
        countryName =
          new Intl.DisplayNames(["en"], { type: "region" }).of(
            countryCode.toUpperCase(),
          ) ?? "";
      } catch {
        // A calling code without a verified country name remains insufficient
        // for shared calling codes such as +1.
      }

      return {
        selectedOptionLabel: [countryName, selectedText]
          .filter(Boolean)
          .join(" ")
          .trim(),
        compositeVisible,
      };
    })
    .catch(() => ({
      selectedOptionLabel: input.control.selectedOptionLabel,
      compositeVisible: input.control.visible,
    }));
}

async function inspectApplicationControls(
  page: Page,
): Promise<InspectedFormControl[]> {
  const controls = await page
    .locator(APPLICATION_FORM_CONTROL_SELECTOR)
    .evaluateAll((elements): InspectedFormControl[] => {
      const getVisible = (element: HTMLElement): boolean => {
        if (element.getAttribute("aria-hidden") === "true") {
          return false;
        }
        const style = window.getComputedStyle(element);
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          element.getClientRects().length > 0
        );
      };
      const getReferencedText = (element: Element): string => {
        const ids = (element.getAttribute("aria-labelledby") ?? "")
          .split(/\s+/u)
          .filter(Boolean);
        return ids
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ")
          .trim();
      };
      const getDirectLabel = (element: Element): string => {
        const ariaLabel = element.getAttribute("aria-label")?.trim();
        if (ariaLabel) {
          return ariaLabel;
        }

        const referencedText = getReferencedText(element);
        if (referencedText) {
          return referencedText;
        }

        const labeledElement = element as
          | HTMLInputElement
          | HTMLSelectElement
          | HTMLTextAreaElement;
        const labels =
          "labels" in labeledElement && labeledElement.labels
            ? Array.from(labeledElement.labels)
            : [];
        const labelsText = labels
          .map((label) => label.innerText.trim())
          .filter(Boolean)
          .join(" ");
        if (labelsText) {
          return labelsText;
        }

        return element.closest("label")?.textContent?.trim() ?? "";
      };
      const getGroupLabel = (element: Element): string => {
        const fieldset = element.closest("fieldset");
        const legend = fieldset?.querySelector(":scope > legend");
        if (legend?.textContent?.trim()) {
          return legend.textContent.trim();
        }

        const group = element.closest("[role='group'], [role='radiogroup']");
        return group
          ? group.getAttribute("aria-label")?.trim() || getReferencedText(group)
          : "";
      };
      const getCustomComboboxSelectedOptionLabel = (
        element: Element,
        semanticRole: string,
      ): string => {
        if (semanticRole !== "combobox") {
          return "";
        }

        const ariaValueText = element.getAttribute("aria-valuetext")?.trim();
        if (ariaValueText) {
          return ariaValueText;
        }

        const controlRoot = element.closest("[class*='__control']");
        const selectedValue = controlRoot?.querySelector<HTMLElement>(
          "[class*='__single-value'], [role='option'][aria-selected='true']",
        );
        return selectedValue?.textContent?.trim() ?? "";
      };

      return elements.map((element, index) => {
        const htmlElement = element as HTMLElement;
        const input = element instanceof HTMLInputElement ? element : null;
        const textarea =
          element instanceof HTMLTextAreaElement ? element : null;
        const select = element instanceof HTMLSelectElement ? element : null;
        const semanticRole = element.getAttribute("role")?.toLowerCase() ?? "";
        const tagName = select
          ? "select"
          : textarea
            ? "textarea"
            : input
              ? "input"
              : "contenteditable";

        return {
          index,
          tagName,
          inputType: input?.type.toLowerCase() ?? (semanticRole || tagName),
          role: semanticRole,
          id: htmlElement.id ?? "",
          name: input?.name ?? textarea?.name ?? select?.name ?? "",
          label: getDirectLabel(element),
          groupLabel: getGroupLabel(element),
          placeholder: input?.placeholder ?? textarea?.placeholder ?? "",
          autocomplete: input?.autocomplete ?? textarea?.autocomplete ?? "",
          required:
            Boolean(
              input?.required ?? textarea?.required ?? select?.required,
            ) || element.getAttribute("aria-required") === "true",
          invalid:
            element.getAttribute("aria-invalid") === "true" ||
            Boolean(
              input?.validity.valid === false ||
              textarea?.validity.valid === false ||
              select?.validity.valid === false,
            ),
          validationMessage:
            input?.validationMessage ??
            textarea?.validationMessage ??
            select?.validationMessage ??
            "",
          disabled: Boolean(
            input?.disabled ?? textarea?.disabled ?? select?.disabled,
          ),
          readOnly: Boolean(input?.readOnly ?? textarea?.readOnly),
          visible: getVisible(htmlElement),
          value:
            input?.value ??
            textarea?.value ??
            select?.value ??
            htmlElement.textContent ??
            "",
          checked:
            input?.checked ?? element.getAttribute("aria-checked") === "true",
          multiple: select?.multiple ?? false,
          options: select
            ? Array.from(select.options)
                .map((option) => option.label.trim())
                .filter(Boolean)
            : [],
          selectedOptionLabel:
            select?.selectedOptions.item(0)?.label.trim() ??
            getCustomComboboxSelectedOptionLabel(element, semanticRole),
        };
      });
    });

  return Promise.all(
    controls.map(async (control) => {
      if (!isCustomPhoneCountryCombobox(control)) {
        return control;
      }

      const customState = await inspectCustomPhoneCountryState({
        page,
        control,
      });
      const selectedOptionLabel =
        customState.selectedOptionLabel || control.selectedOptionLabel;
      return {
        ...control,
        selectedOptionLabel,
        visible:
          control.visible ||
          (customState.compositeVisible && Boolean(selectedOptionLabel.trim())),
      };
    }),
  );
}

async function inspectApplicationPage(
  page: Page,
): Promise<ApplicationPageInspection> {
  const [controls, actions, bodyText, frameHints] = await Promise.all([
    inspectApplicationControls(page),
    page
      .locator(APPLICATION_ACTION_CONTROL_SELECTOR)
      .evaluateAll((elements): InspectedActionControl[] =>
        elements.map((element, index) => {
          const htmlElement = element as HTMLElement;
          const input = element instanceof HTMLInputElement ? element : null;
          const button = element instanceof HTMLButtonElement ? element : null;
          const style = window.getComputedStyle(htmlElement);
          const visible =
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.opacity !== "0" &&
            htmlElement.getClientRects().length > 0;
          const label =
            element.getAttribute("aria-label")?.trim() ||
            element.getAttribute("title")?.trim() ||
            input?.value.trim() ||
            htmlElement.innerText.trim();

          const anchorHref =
            element instanceof HTMLAnchorElement ? element.href : "";

          return {
            index,
            label,
            type: (input?.type ?? button?.type ?? "button").toLowerCase(),
            visible,
            disabled:
              Boolean(input?.disabled ?? button?.disabled) ||
              element.getAttribute("aria-disabled") === "true",
            href: /^https?:\/\//iu.test(anchorHref) ? anchorHref : null,
          };
        }),
      ),
    page
      .locator("body")
      .innerText({ timeout: 5_000 })
      .then((text) => text.slice(0, 20_000))
      .catch(() => ""),
    page.locator("iframe").evaluateAll((elements) =>
      elements.flatMap((element) => {
        const htmlElement = element as HTMLElement;
        const style = window.getComputedStyle(htmlElement);
        const visible =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          htmlElement.getClientRects().length > 0;
        if (!visible) {
          return [];
        }
        return [
          [
            element.getAttribute("title"),
            element.getAttribute("name"),
            element.getAttribute("src"),
          ]
            .filter((value): value is string => Boolean(value))
            .join(" "),
        ];
      }),
    ),
  ]);

  return {
    url: safePageUrl(page),
    title: await safePageTitle(page),
    bodyText,
    frameHints,
    controls,
    actions,
  };
}

async function clickCurrentSafeActionBySignature(input: {
  page: Page;
  expectedSignature: string;
}): Promise<
  | { status: "clicked"; action: InspectedActionControl }
  | {
      status: "changed" | "missing" | "unsafe";
      action: InspectedActionControl | null;
    }
> {
  const inspection = await inspectApplicationPage(input.page);
  const matchingActions = inspection.actions.filter(
    (action) =>
      action.visible &&
      !action.disabled &&
      createActionSemanticSignature(action) === input.expectedSignature,
  );
  if (matchingActions.length === 0) {
    return { status: "missing", action: null };
  }
  if (matchingActions.length !== 1) {
    return { status: "changed", action: null };
  }

  const action = matchingActions[0]!;
  if (!isSafeApplicationAdvance(action, inspection)) {
    return { status: "unsafe", action };
  }

  const handle = await input.page
    .locator(APPLICATION_ACTION_CONTROL_SELECTOR)
    .nth(action.index)
    .elementHandle();
  if (!handle) {
    return { status: "missing", action: null };
  }

  const handleAction = await handle.evaluate(
    (element, index): InspectedActionControl => {
      const htmlElement = element as HTMLElement;
      const inputElement = element instanceof HTMLInputElement ? element : null;
      const buttonElement =
        element instanceof HTMLButtonElement ? element : null;
      const style = window.getComputedStyle(htmlElement);

      return {
        index,
        label:
          element.getAttribute("aria-label")?.trim() ||
          element.getAttribute("title")?.trim() ||
          inputElement?.value.trim() ||
          htmlElement.innerText.trim(),
        type: (
          inputElement?.type ??
          buttonElement?.type ??
          "button"
        ).toLowerCase(),
        visible:
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          htmlElement.getClientRects().length > 0,
        disabled:
          Boolean(inputElement?.disabled ?? buttonElement?.disabled) ||
          element.getAttribute("aria-disabled") === "true",
      };
    },
    action.index,
  );
  if (
    !handleAction.visible ||
    handleAction.disabled ||
    createActionSemanticSignature(handleAction) !== input.expectedSignature ||
    !isSafeApplicationAdvance(handleAction, inspection)
  ) {
    return { status: "changed", action: handleAction };
  }

  await handle.click({ timeout: 10_000 });
  return { status: "clicked", action: handleAction };
}

function detectPageBlocker(
  inspection: ApplicationPageInspection,
): DetectedPageBlocker | null {
  const visiblePageSignal = normalizeControlSignal(
    [inspection.title, inspection.bodyText]
      .filter((value): value is string => Boolean(value))
      .join(" "),
  );
  const bodySignal = normalizeControlSignal(
    [inspection.title, inspection.bodyText, ...inspection.frameHints]
      .filter((value): value is string => Boolean(value))
      .join(" "),
  );
  const passwordVisible = inspection.controls.some(
    (control) => control.visible && control.inputType === "password",
  );
  const captchaVisible =
    /\b(?:captcha|recaptcha|hcaptcha|verify you are human|human verification|security challenge|cloudflare challenge)\b/u.test(
      visiblePageSignal,
    );
  const visibleActionLabels = inspection.actions
    .filter((action) => action.visible && !action.disabled)
    .map((action) => normalizeControlSignal(action.label));
  const hasLoginAction = visibleActionLabels.some((label) =>
    /^(?:sign in|log in|create account|sign up|register)$/u.test(label),
  );
  // A header "Sign in" beside a posting's Apply link or a "start application"
  // choice is not a gate: the application has not been opened yet.
  const hasApplicationAdvanceAction =
    visibleActionLabels.some((label) =>
      /^(?:next|continue|continue application|save and continue|review|review application)$/u.test(
        label,
      ),
    ) ||
    findApplicationEntryLink(inspection) !== null ||
    (isApplicationEntryPage(inspection) &&
      visibleActionLabels.some((label) =>
        APPLICATION_MANUAL_ENTRY_LABELS.has(label),
      ));

  if (captchaVisible) {
    return {
      code: "requires_manual_review",
      summary: "Human verification blocks application preparation.",
      detail:
        "The page exposes a CAPTCHA or human-verification challenge. The runtime stopped without interacting with the challenge or any final action.",
      nextActionLabel: "Complete the verification manually, then retry",
    };
  }

  if (
    passwordVisible ||
    (hasLoginAction && !hasApplicationAdvanceAction) ||
    /\b(?:(?:sign in|log in|sign up|register) to (?:continue|apply|complete)|create (?:an )?account to (?:continue|apply|complete))\b/u.test(
      bodySignal,
    )
  ) {
    return {
      code: "site_login_required",
      summary: "The application requires an authenticated account.",
      detail:
        "The page requests account credentials. The runtime does not enter passwords, create accounts, or continue through login gates.",
      nextActionLabel: "Sign in manually, then retry preparation",
    };
  }

  const consentControl = inspection.controls.find((control) => {
    if (
      !control.visible ||
      !control.required ||
      control.checked ||
      !["checkbox", "radio"].includes(control.inputType)
    ) {
      return false;
    }

    const signal = normalizeControlSignal(
      [control.groupLabel, control.label, control.name].join(" "),
    );
    return /\b(?:agree|consent|terms|privacy|certify|acknowledge|authorize|declaration)\b/u.test(
      signal,
    );
  });

  if (consentControl) {
    const prompt =
      consentControl.groupLabel ||
      consentControl.label ||
      "Required consent decision";
    return {
      code: "missing_consent",
      summary: "A required consent decision needs manual review.",
      detail: `The runtime stopped before changing the required consent control '${prompt}'.`,
      nextActionLabel: "Review and decide the consent request manually",
    };
  }

  return null;
}

function inferQuestionKind(
  control: InspectedFormControl,
): ApplicationAttemptQuestion["kind"] {
  const signal = normalizeControlSignal(
    [control.groupLabel, control.label, control.name, control.placeholder].join(
      " ",
    ),
  );

  if (/\b(?:work authorization|authorized to work)\b/u.test(signal)) {
    return "work_authorization";
  }
  if (/\b(?:visa|sponsor|sponsorship)\b/u.test(signal)) {
    return "visa_sponsorship";
  }
  if (/\b(?:salary|compensation|pay expectation)\b/u.test(signal)) {
    return "salary_expectation";
  }
  if (/\b(?:availability|available to start|start date)\b/u.test(signal)) {
    return "availability";
  }
  if (/\bnotice period\b/u.test(signal)) {
    return "notice_period";
  }
  if (/\b(?:portfolio|linkedin|github|website)\b/u.test(signal)) {
    return "portfolio";
  }
  if (/\bcover letter\b/u.test(signal)) {
    return "cover_letter";
  }
  if (/\b(?:years? of experience|experience)\b/u.test(signal)) {
    return "experience";
  }
  if (/\b(?:clearance|security clearance)\b/u.test(signal)) {
    return "clearance";
  }
  if (/\brelocat/u.test(signal)) {
    return "relocation";
  }
  if (/\btravel\b/u.test(signal)) {
    return "travel";
  }
  if (/\b(?:location|city|country|region)\b/u.test(signal)) {
    return "location";
  }
  if (/\b(?:resume|cv)\b/u.test(signal)) {
    return "resume";
  }
  if (/\b(?:name|email|phone|telephone)\b/u.test(signal)) {
    return "personal_info";
  }

  return "other";
}

function isControlAnswered(
  control: InspectedFormControl,
  controls: readonly InspectedFormControl[],
  filledControlIndexes: ReadonlySet<number>,
): boolean {
  if (filledControlIndexes.has(control.index)) {
    return true;
  }

  if (["checkbox", "radio"].includes(control.inputType)) {
    if (control.checked) {
      return true;
    }

    return Boolean(
      control.name &&
      controls.some(
        (candidate) =>
          candidate.name === control.name &&
          candidate.visible &&
          candidate.checked,
      ),
    );
  }

  const normalizedValue = normalizeControlSignal(control.value);
  if (!normalizedValue) {
    return false;
  }

  if (
    control.tagName === "select" &&
    /^(?:select|choose|please select|please choose)$/u.test(normalizedValue)
  ) {
    return false;
  }

  return true;
}

function toStableIdSegment(value: string): string {
  return (
    normalizeControlSignal(value).replace(/\s+/gu, "_").slice(0, 48) || "field"
  );
}

function getQuestionPrompt(control: InspectedFormControl): string {
  if (isPhoneCountryCodeControl(control)) {
    return "Phone country code";
  }
  return (
    control.groupLabel ||
    control.label ||
    control.placeholder ||
    control.name ||
    `Required ${control.inputType || control.tagName} field`
  );
}

function inferAnswerControlType(
  control: InspectedFormControl,
  controls: readonly InspectedFormControl[],
): NonNullable<ApplicationAttemptQuestion["answerControlType"]> {
  if (control.inputType === "file") {
    return "file";
  }
  if (control.inputType === "date") {
    return "date";
  }
  if (control.inputType === "radio" || control.role === "radio") {
    return "single_choice";
  }
  if (control.inputType === "checkbox" || control.role === "checkbox") {
    const groupSize = control.name
      ? controls.filter(
          (candidate) =>
            candidate.visible &&
            candidate.name === control.name &&
            (candidate.inputType === "checkbox" ||
              candidate.role === "checkbox"),
        ).length
      : 1;
    return groupSize > 1 ? "multi_choice" : "boolean";
  }
  if (control.tagName === "select") {
    return control.multiple ? "multi_choice" : "single_choice";
  }
  return "text";
}

function buildUnknownRequiredQuestions(input: {
  jobId: string;
  step: number;
  now: string;
  controls: readonly InspectedFormControl[];
  filledControlIndexes: ReadonlySet<number>;
}): ApplicationAttemptQuestion[] {
  const questions = new Map<string, ApplicationAttemptQuestion>();

  input.controls.forEach((control) => {
    if (
      !control.visible ||
      control.disabled ||
      control.readOnly ||
      (!control.required && !control.invalid) ||
      control.inputType === "hidden" ||
      isControlAnswered(control, input.controls, input.filledControlIndexes)
    ) {
      return;
    }

    const prompt = getQuestionPrompt(control);
    const groupKey =
      ["radio", "checkbox"].includes(control.inputType) && control.name
        ? `group:${control.name}`
        : `control:${control.index}`;
    if (questions.has(groupKey)) {
      return;
    }

    const answerOptions =
      ["radio", "checkbox"].includes(control.inputType) && control.name
        ? input.controls
            .filter(
              (candidate) =>
                candidate.inputType === control.inputType &&
                candidate.name === control.name &&
                candidate.visible,
            )
            .map((candidate) => candidate.label)
            .filter(Boolean)
        : control.tagName === "select"
          ? control.options
          : [];
    const kind = inferQuestionKind(control);
    questions.set(groupKey, {
      id: `question_${input.jobId}_step_${input.step}_${toStableIdSegment(prompt)}_${control.index}`,
      prompt,
      kind,
      answerControlType: inferAnswerControlType(control, input.controls),
      isRequired: control.required || control.invalid,
      detectedAt: input.now,
      answerOptions,
      suggestedAnswers: [],
      submittedAnswer: null,
      status: "detected",
    });
  });

  return [...questions.values()];
}

function buildGroundedQuestion(input: {
  jobId: string;
  step: number;
  control: InspectedFormControl;
  answer: GroundedControlAnswer;
  now: string;
}): ApplicationAttemptQuestion {
  const prompt = getQuestionPrompt(input.control);
  const questionId = `question_${input.jobId}_step_${input.step}_${toStableIdSegment(prompt)}_${input.control.index}`;
  const displayedAnswer = input.answer.fileName ?? input.answer.value;

  return {
    id: questionId,
    prompt,
    kind: input.answer.kind,
    answerControlType: inferAnswerControlType(input.control, [input.control]),
    isRequired: input.control.required,
    detectedAt: input.now,
    answerOptions: input.control.options,
    suggestedAnswers: [
      {
        id: `suggested_answer_${questionId}`,
        text: displayedAnswer,
        sourceKind: input.answer.sourceKind,
        sourceId: input.answer.sourceId,
        confidenceLabel: input.answer.fileName
          ? "exact approved file"
          : "exact profile field",
        provenance: [
          {
            id: `answer_provenance_${questionId}`,
            sourceKind: input.answer.sourceKind,
            sourceId: input.answer.sourceId,
            label: input.answer.provenanceLabel,
            snippet: displayedAnswer,
          },
        ],
      },
    ],
    submittedAnswer: displayedAnswer,
    status: "answered",
  };
}

function buildGroundedMismatchQuestion(input: {
  jobId: string;
  step: number;
  control: InspectedFormControl;
  answer: GroundedControlAnswer;
  now: string;
}): ApplicationAttemptQuestion {
  return {
    ...buildGroundedQuestion(input),
    submittedAnswer: null,
    status: "detected",
  };
}

function groundedControlHasPrefillConflict(
  control: InspectedFormControl,
  answer: GroundedControlAnswer,
): boolean {
  if (
    control.inputType === "file" ||
    ["checkbox", "radio"].includes(control.inputType)
  ) {
    return false;
  }

  if (isCustomPhoneCountryCombobox(control)) {
    if (!control.selectedOptionLabel.trim()) {
      return Boolean(
        control.value.trim() &&
        !isPlausiblyCorruptedPhoneCountryValue(control.value),
      );
    }
    return !groundedAnswerPersisted(control, answer);
  }

  if (isCustomCombobox(control)) {
    if (groundedAnswerPersisted(control, answer)) {
      return false;
    }
    return Boolean(control.selectedOptionLabel.trim() || control.value.trim());
  }

  if (control.tagName === "select") {
    const normalizedAnswer = normalizeControlSignal(answer.value);
    const isCountryControl = hasExactControlSignal(control, COUNTRY_SIGNALS);
    const isPhoneCountryControl = isPhoneCountryCodeControl(control);
    const matchingPhoneCountryOption = isPhoneCountryControl
      ? resolveNativePhoneCountryOption(control.options, answer)
      : null;
    const hasMatchingOption = isPhoneCountryControl
      ? Boolean(matchingPhoneCountryOption)
      : control.options.some((option) => {
          const normalizedOption = normalizeControlSignal(option);
          return (
            normalizedOption === normalizedAnswer ||
            (isCountryControl &&
              normalizedOption.startsWith(`${normalizedAnswer} `) &&
              /\+\d{1,4}/u.test(option))
          );
        });
    if (!hasMatchingOption || groundedAnswerPersisted(control, answer)) {
      return false;
    }

    const populatedValues = [control.value, control.selectedOptionLabel]
      .map(normalizeControlSignal)
      .filter(Boolean);
    const currentLooksLikePlaceholder = populatedValues.some((value) =>
      /^(?:select|choose|please select|please choose)$/u.test(value),
    );
    return populatedValues.length > 0 && !currentLooksLikePlaceholder;
  }

  return Boolean(
    control.value.trim() && !groundedAnswerPersisted(control, answer),
  );
}

async function fillCustomPhoneCountryCombobox(input: {
  page: Page;
  control: InspectedFormControl;
  answer: GroundedControlAnswer;
}): Promise<GroundedControlFillResult> {
  if (groundedAnswerPersisted(input.control, input.answer)) {
    return "already_matches";
  }
  if (input.control.selectedOptionLabel.trim()) {
    return "mismatch";
  }
  if (
    input.control.value.trim() &&
    !isPlausiblyCorruptedPhoneCountryValue(input.control.value)
  ) {
    return "mismatch";
  }

  const countryHint = input.answer.optionCountryHint?.trim();
  if (!countryHint) {
    return "unsupported";
  }

  const controlLocator = input.page
    .locator(APPLICATION_FORM_CONTROL_SELECTOR)
    .nth(input.control.index);
  await controlLocator.click();
  await controlLocator.fill(countryHint);

  const optionLocator = input.page.locator(
    "[role='option']:not([aria-hidden='true'])",
  );
  const options = await optionLocator.evaluateAll((elements) =>
    elements.map((element, index) => {
      const htmlElement = element as HTMLElement;
      const style = window.getComputedStyle(htmlElement);
      return {
        index,
        label: htmlElement.textContent?.trim() ?? "",
        visible:
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          htmlElement.getClientRects().length > 0,
      };
    }),
  );
  const matchingOption = resolveCustomPhoneCountryOption(options, input.answer);
  if (!matchingOption) {
    return "unsupported";
  }

  await optionLocator.nth(matchingOption.index).click();
  await controlLocator.blur().catch(() => undefined);
  return "filled";
}

async function fillExactCustomCombobox(input: {
  page: Page;
  control: InspectedFormControl;
  answer: GroundedControlAnswer;
}): Promise<GroundedControlFillResult> {
  if (groundedAnswerPersisted(input.control, input.answer)) {
    return "already_matches";
  }
  if (input.control.selectedOptionLabel.trim() || input.control.value.trim()) {
    return "mismatch";
  }

  const controlLocator = input.page
    .locator(APPLICATION_FORM_CONTROL_SELECTOR)
    .nth(input.control.index);
  await controlLocator.click();

  const optionLocator = input.page.locator(
    "[role='option']:not([aria-hidden='true'])",
  );
  const options = await optionLocator.evaluateAll((elements) =>
    elements.map((element, index) => {
      const htmlElement = element as HTMLElement;
      const style = window.getComputedStyle(htmlElement);
      return {
        index,
        label: htmlElement.textContent?.trim() ?? "",
        visible:
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          htmlElement.getClientRects().length > 0,
      };
    }),
  );
  const matchingOption = resolveExactCustomComboboxOption(
    options,
    input.answer,
  );
  if (!matchingOption) {
    await controlLocator.blur().catch(() => undefined);
    return "unsupported";
  }

  await optionLocator.nth(matchingOption.index).click();
  await controlLocator.blur().catch(() => undefined);
  return "filled";
}

async function fillGroundedControl(input: {
  page: Page;
  control: InspectedFormControl;
  answer: GroundedControlAnswer;
}): Promise<GroundedControlFillResult> {
  const locator = input.page
    .locator(APPLICATION_FORM_CONTROL_SELECTOR)
    .nth(input.control.index);

  if (input.control.inputType === "file") {
    if (input.answer.fileName) {
      const extension = extname(input.answer.fileName).toLowerCase();
      const mimeType =
        input.answer.fileMime ??
        (extension === ".pdf"
          ? "application/pdf"
          : extension === ".docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : extension === ".doc"
              ? "application/msword"
              : "application/octet-stream");
      await locator.setInputFiles({
        name: input.answer.fileName,
        mimeType,
        buffer: input.answer.loadFileBytes
          ? Buffer.from(await input.answer.loadFileBytes())
          : await readFile(input.answer.value),
      });
    } else {
      await locator.setInputFiles(input.answer.value);
    }
    return "filled";
  }

  if (["checkbox", "radio"].includes(input.control.inputType)) {
    return "unsupported";
  }

  if (isCustomPhoneCountryCombobox(input.control)) {
    return fillCustomPhoneCountryCombobox({
      page: input.page,
      control: input.control,
      answer: input.answer,
    });
  }
  if (isCustomCombobox(input.control)) {
    return fillExactCustomCombobox({
      page: input.page,
      control: input.control,
      answer: input.answer,
    });
  }
  if (input.control.tagName === "select") {
    const normalizedAnswer = normalizeControlSignal(input.answer.value);
    const isCountryControl = hasExactControlSignal(
      input.control,
      COUNTRY_SIGNALS,
    );
    const isPhoneCountryControl = isPhoneCountryCodeControl(input.control);
    const matchingOption = isPhoneCountryControl
      ? resolveNativePhoneCountryOption(input.control.options, input.answer)
      : input.control.options.find((option) => {
          const normalizedOption = normalizeControlSignal(option);
          return (
            normalizedOption === normalizedAnswer ||
            (isCountryControl &&
              normalizedOption.startsWith(`${normalizedAnswer} `) &&
              /\+\d{1,4}/u.test(option))
          );
        });
    if (!matchingOption) {
      return "unsupported";
    }

    const normalizedCurrentValue = normalizeControlSignal(input.control.value);
    const normalizedSelectedLabel = normalizeControlSignal(
      input.control.selectedOptionLabel,
    );
    const currentLooksLikePlaceholder = [
      normalizedCurrentValue,
      normalizedSelectedLabel,
    ]
      .filter(Boolean)
      .some((value) =>
        /^(?:select|choose|please select|please choose)$/u.test(value),
      );
    if (
      isPhoneCountryControl &&
      groundedAnswerPersisted(input.control, input.answer)
    ) {
      return "already_matches";
    }
    if (
      !isPhoneCountryControl &&
      (normalizedCurrentValue === normalizedAnswer ||
        normalizedSelectedLabel === normalizedAnswer)
    ) {
      return "already_matches";
    }
    if (
      (normalizedCurrentValue || normalizedSelectedLabel) &&
      !currentLooksLikePlaceholder
    ) {
      return "mismatch";
    }

    await locator.selectOption({ label: matchingOption });
    return "filled";
  }

  if (input.control.value.trim()) {
    return groundedAnswerPersisted(input.control, input.answer)
      ? "already_matches"
      : "mismatch";
  }

  await locator.fill(input.answer.value);
  if (input.answer.provenanceLabel === "Candidate profile phone") {
    // Greenhouse's international-phone control commits its React state on
    // blur. Without this, the digits can remain visibly present while the
    // widget later replaces the underlying input during validation.
    await locator.blur();
  }
  return "filled";
}

async function fillGroundedControlWithinPolicy(input: {
  page: Page;
  control: InspectedFormControl;
  answer: GroundedControlAnswer;
  intermediateMutationsAuthorized: boolean;
  recheckIntermediateMutationAuthority?: (
    observedOrigin: string,
  ) => Promise<boolean>;
}): Promise<GroundedControlFillResult> {
  if (!input.intermediateMutationsAuthorized) {
    return fillGroundedControl(input);
  }

  let observedOrigin: string;
  try {
    observedOrigin = new URL(input.page.url()).origin;
  } catch {
    throw new Error(
      "Application origin is unavailable for the authority recheck.",
    );
  }
  if (
    !input.recheckIntermediateMutationAuthority ||
    !(await input.recheckIntermediateMutationAuthority(observedOrigin))
  ) {
    throw new Error(
      "Intermediate-mutation authority changed before the field action.",
    );
  }

  await openPrepareOnlyIntermediateMutationWindow(input.page);
  try {
    const result = await fillGroundedControl(input);
    // Keep the exact field window open only long enough for the synchronous or
    // immediately queued autosave caused by this mutation. Later traffic is
    // ambiguous and is blocked by the normal guard.
    await input.page.waitForTimeout(750);
    return result;
  } finally {
    await closePrepareOnlyIntermediateMutationWindow(input.page);
  }
}

function groundedAnswerPersisted(
  control: InspectedFormControl,
  answer: GroundedControlAnswer,
): boolean {
  if (control.inputType === "file") {
    return Boolean(control.value.trim());
  }

  if (isCustomPhoneCountryCombobox(control)) {
    return Boolean(
      control.selectedOptionLabel.trim() &&
      phoneCountryOptionMatches(control.selectedOptionLabel, answer),
    );
  }

  if (isCustomCombobox(control)) {
    const normalizedSelectedOption = normalizeControlSignal(
      control.selectedOptionLabel,
    );
    return Boolean(
      normalizedSelectedOption &&
      normalizedSelectedOption === normalizeControlSignal(answer.value),
    );
  }

  if (control.tagName === "select" && isPhoneCountryCodeControl(control)) {
    return Boolean(
      control.selectedOptionLabel.trim() &&
      phoneCountryOptionMatches(control.selectedOptionLabel, answer),
    );
  }
  const normalizedAnswer = normalizeControlSignal(answer.value);
  const normalizedValues = [control.value, control.selectedOptionLabel]
    .map(normalizeControlSignal)
    .filter(Boolean);
  if (normalizedValues.includes(normalizedAnswer)) {
    return true;
  }

  // International phone widgets commonly keep the country selector and the
  // national number as separate controls while rendering the text input back
  // as a fully formatted number (for example, `(+383) 44283970`). The grounded
  // answer intentionally strips the selected calling code before filling that
  // input, so compare canonical digits as well as presentation text. Limit the
  // equivalence to an exact phone control and a plausible 1-4 digit calling
  // code prefix; this must not make arbitrary field mismatches look valid.
  if (
    !isPhoneCountryCodeControl(control) &&
    (answer.provenanceLabel === "Candidate profile phone" ||
      hasExactControlSignal(control, PHONE_SIGNALS))
  ) {
    const answerDigits = answer.value.replace(/\D/gu, "");
    const persistedPhoneMatches = [
      control.value,
      control.selectedOptionLabel,
    ].some((value) => {
      const persistedDigits = value.replace(/\D/gu, "");
      const prefixLength = persistedDigits.length - answerDigits.length;
      const answerPrefixLength = answerDigits.length - persistedDigits.length;
      return (
        answerDigits.length >= 6 &&
        ((prefixLength >= 0 &&
          prefixLength <= 4 &&
          persistedDigits.endsWith(answerDigits)) ||
          (persistedDigits.length >= 6 &&
            answerPrefixLength >= 1 &&
            answerPrefixLength <= 4 &&
            answerDigits.endsWith(persistedDigits)))
      );
    });
    if (persistedPhoneMatches) {
      return true;
    }
  }

  return (
    control.tagName === "select" &&
    hasExactControlSignal(control, COUNTRY_SIGNALS) &&
    normalizedValues.some((value) => value.startsWith(`${normalizedAnswer} `))
  );
}

function hasFinalApplicationWording(action: InspectedActionControl): boolean {
  const label = normalizeControlSignal(action.label);
  return /\b(?:submit|send|finish|complete|confirm)\b/u.test(label);
}

function hasFinalApplicationPageEvidence(
  inspection: ApplicationPageInspection,
): boolean {
  const pageSignal = normalizeControlSignal(
    [inspection.title, inspection.bodyText]
      .filter((value): value is string => Boolean(value))
      .join(" "),
  );
  return /\b(?:review (?:your )?application|application review|ready to submit|final (?:application )?step|before (?:you )?submit|submit your application)\b/u.test(
    pageSignal,
  );
}

function hasVisibleApplicationForm(
  inspection: ApplicationPageInspection,
): boolean {
  return inspection.controls.some(
    (control) =>
      control.visible &&
      (control.required || control.invalid || isResumeUploadControl(control)),
  );
}

/**
 * An Apply on a job posting is followed only when it is a link: opening its
 * destination is the same navigation the runtime performs for an application
 * URL, so it can send nothing. A button with the same wording is not proven
 * navigation (a signed-in profile can make it a one-click apply) and stays
 * untouched.
 */
const APPLICATION_ENTRY_LINK_LABELS = new Set([
  "apply",
  "apply now",
  "apply for this job",
  "apply for this position",
  "apply to this job",
  "apply to this position",
  "apply online",
  "apply here",
]);

/**
 * Choices a site offers before its form that promise a manual, from-scratch
 * application. With no application form on the page there is nothing
 * prepared to submit, so choosing one only opens the form.
 */
const APPLICATION_MANUAL_ENTRY_LABELS = new Set([
  "apply manually",
  "start application",
  "start your application",
  "begin application",
]);

function isApplicationEntryPage(
  inspection: ApplicationPageInspection,
): boolean {
  return (
    !hasVisibleApplicationForm(inspection) &&
    !hasFinalApplicationPageEvidence(inspection)
  );
}

function findApplicationEntryLink(
  inspection: ApplicationPageInspection,
): InspectedActionControl | null {
  if (!isApplicationEntryPage(inspection)) {
    return null;
  }
  // A manual-entry choice that is itself a link is followed by URL as well:
  // a hydrated click can route through a form submission the guard blocks,
  // while opening the destination is the same navigation with nothing sent.
  return (
    inspection.actions.find((action) => {
      const label = normalizeControlSignal(action.label);
      return (
        action.visible &&
        !action.disabled &&
        typeof action.href === "string" &&
        (APPLICATION_ENTRY_LINK_LABELS.has(label) ||
          APPLICATION_MANUAL_ENTRY_LABELS.has(label))
      );
    }) ?? null
  );
}

function isFinalApplicationAction(
  action: InspectedActionControl,
  inspection: ApplicationPageInspection,
): boolean {
  if (hasFinalApplicationWording(action)) {
    return true;
  }

  const normalizedLabel = normalizeControlSignal(action.label);
  if (
    new Set(["apply", "apply now"]).has(normalizedLabel) &&
    (hasVisibleApplicationForm(inspection) ||
      hasFinalApplicationPageEvidence(inspection))
  ) {
    return true;
  }

  return (
    action.type === "submit" && hasFinalApplicationPageEvidence(inspection)
  );
}

function isSafeApplicationAdvance(
  action: InspectedActionControl,
  inspection: ApplicationPageInspection,
): boolean {
  if (
    action.type === "submit" ||
    hasFinalApplicationWording(action) ||
    isFinalApplicationAction(action, inspection)
  ) {
    return false;
  }

  const label = normalizeControlSignal(action.label);
  if (
    new Set([
      "next",
      "continue",
      "continue application",
      "save and continue",
      "review",
      "review application",
      "continue to review",
      "proceed to review",
      "review and continue",
    ]).has(label)
  ) {
    return true;
  }
  return (
    APPLICATION_MANUAL_ENTRY_LABELS.has(label) &&
    isApplicationEntryPage(inspection)
  );
}

function createInspectionSignature(
  inspection: ApplicationPageInspection,
): string {
  return JSON.stringify({
    url: inspection.url,
    controls: inspection.controls
      .filter((control) => control.visible)
      .map((control) => [
        control.inputType,
        control.name,
        control.label,
        control.groupLabel,
        control.value,
        control.checked,
        control.invalid,
        control.validationMessage,
      ]),
    actions: inspection.actions
      .filter((action) => action.visible)
      .map((action) => [action.label, action.type, action.disabled]),
  });
}

function createPreparationConsentDecisions(input: {
  jobId: string;
  now: string;
  questions: readonly ApplicationAttemptQuestion[];
  usesOriginalResume: boolean;
  manualDecisionLabel?: string;
}) {
  const resumeAttached = input.questions.some(
    (question) => question.kind === "resume" && question.status === "answered",
  );
  const profileAutofilled = input.questions.some(
    (question) => question.kind !== "resume" && question.status === "answered",
  );

  return [
    ...(resumeAttached
      ? [
          {
            id: `consent_${input.jobId}_resume_use`,
            kind: "resume_use" as const,
            label: input.usesOriginalResume
              ? "Use the selected original resume for this application"
              : "Use the approved tailored resume for this application",
            status: "approved" as const,
            decidedAt: input.now,
            detail: input.usesOriginalResume
              ? "The exact original resume selected by the user was attached during prepare-only automation."
              : "The approved tailored resume was attached during prepare-only automation.",
          },
        ]
      : []),
    ...(profileAutofilled
      ? [
          {
            id: `consent_${input.jobId}_autofill_profile`,
            kind: "autofill_profile" as const,
            label: "Use exact saved profile fields for this application",
            status: "approved" as const,
            decidedAt: input.now,
            detail:
              "Only exact identity, contact, location, and portfolio field matches were filled.",
          },
        ]
      : []),
    ...(input.manualDecisionLabel
      ? [
          {
            id: `consent_${input.jobId}_manual_follow_up`,
            kind: "manual_follow_up" as const,
            label: input.manualDecisionLabel,
            status: "requested" as const,
            decidedAt: null,
            detail:
              "The runtime paused without making this decision on the user's behalf.",
          },
        ]
      : []),
  ];
}

export function buildPreparationResult(input: {
  executionInput: ExecuteApplicationFlowInput;
  state?: "paused" | "failed";
  summary: string;
  detail: string;
  questions: readonly ApplicationAttemptQuestion[];
  blocker: ApplicationAttemptBlocker | null;
  checkpoints: readonly ApplicationAttemptCheckpoint[];
  checkpointLabel: string;
  checkpointDetail: string;
  checkpointUrls: readonly string[];
  lastUrl: string | null;
  now: string;
  nextActionLabel: string;
  manualDecisionLabel?: string;
  externalWrites?: readonly ApplicationAttemptExternalWriteEvidence[];
}): ApplyExecutionResult {
  const finalCheckpoint: ApplicationAttemptCheckpoint = {
    id: `checkpoint_${input.executionInput.job.id}_${toStableIdSegment(input.checkpointLabel)}_${input.checkpoints.length + 1}`,
    at: input.now,
    label: input.checkpointLabel,
    detail: input.checkpointDetail,
    state: input.state ?? "paused",
    visualEvidence: [],
  };
  const questions = [...input.questions];

  return ApplyExecutionResultSchema.parse({
    state: input.state ?? "paused",
    summary: input.summary,
    detail: input.detail,
    submittedAt: null,
    outcome: null,
    questions,
    blocker: input.blocker,
    consentDecisions: createPreparationConsentDecisions({
      jobId: input.executionInput.job.id,
      now: input.now,
      questions,
      usesOriginalResume:
        input.executionInput.resumeArtifact.source === "original_upload",
      ...(input.manualDecisionLabel
        ? { manualDecisionLabel: input.manualDecisionLabel }
        : {}),
    }),
    replay: {
      sourceInstructionArtifactId: null,
      sourceDebugEvidenceRefIds: [],
      lastUrl: input.lastUrl,
      checkpointUrls: [...new Set(input.checkpointUrls)],
    },
    visualEvidence: [],
    visualObservationSets: [],
    visualCheckpoints: [],
    nextActionLabel: input.nextActionLabel,
    checkpoints: [...input.checkpoints, finalCheckpoint],
    externalWrites: input.externalWrites
      ? [...input.externalWrites]
      : undefined,
  });
}

export async function runGenericApplicationPreparation(input: {
  context: BrowserContext;
  page: Page;
  executionInput: ExecuteApplicationFlowInput;
  signal?: AbortSignal;
  startedAt: string;
  sentinel?: ApplicationRunServiceWorkerSentinel;
}): Promise<ApplyExecutionResult> {
  const { executionInput, startedAt } = input;
  const targetUrl =
    executionInput.job.applicationUrl ?? executionInput.job.canonicalUrl;
  const questions = new Map<string, ApplicationAttemptQuestion>();
  const checkpointUrls = new Set<string>([
    ...(executionInput.recoveryContext?.checkpointUrls ?? []),
    ...(executionInput.recoveryContext?.latestCheckpoint?.url
      ? [executionInput.recoveryContext.latestCheckpoint.url]
      : []),
    targetUrl,
  ]);
  const checkpoints: ApplicationAttemptCheckpoint[] = [];
  const seenInspections = new Set<string>();
  const externalWrites: ApplicationAttemptExternalWriteEvidence[] = [];
  const buildCurrentPreparationResult = (
    resultInput: Omit<
      Parameters<typeof buildPreparationResult>[0],
      "externalWrites"
    >,
  ) =>
    buildPreparationResult({
      ...resultInput,
      externalWrites,
    });
  let currentPage = input.page;
  let resumeAttached = false;
  // Background traffic the page makes on its own (analytics beacons, GraphQL
  // reads, locale files) is rejected by the guard regardless; rejecting it is
  // the containment. Until the runtime has filled or clicked anything, such a
  // rejection cannot be a consequence of the runtime's work, so it is noted
  // and tolerated rather than escalated into a manual-review stop. The moment
  // the runtime mutates the page, every new rejection is a stop again, because
  // it could be the site saving a field the runtime just touched. Submit-like
  // and containment attempts (popups, downloads, new windows) are never
  // tolerated.
  let runtimeHasMutatedPage = false;
  // A page the runtime just opened or advanced to may still be rendering its
  // form; the first inspection of it gets the same grace as the first step.
  let awaitingFreshPage = true;
  const toleratedBlockedAttemptKeys = new Set<string>();
  const blockedAttemptKey = (attempt: PrepareOnlyBlockedAttempt): string =>
    `${attempt.kind}|${attempt.method}|${attempt.url ?? ""}|${attempt.at}`;
  const isPageOwnBackgroundTraffic = (
    attempt: PrepareOnlyBlockedAttempt,
  ): boolean =>
    !attempt.kind.includes("submit") &&
    attempt.kind !== "popup_open" &&
    attempt.kind !== "download" &&
    attempt.kind !== "window_open";
  const isCrossOriginAttempt = (
    attempt: PrepareOnlyBlockedAttempt,
  ): boolean => {
    try {
      const pageUrl = safePageUrl(currentPage);
      return (
        !!attempt.url &&
        !!pageUrl &&
        new URL(attempt.url).origin !== new URL(pageUrl).origin
      );
    } catch {
      return false;
    }
  };
  const isContainmentAttempt = (attempt: PrepareOnlyBlockedAttempt): boolean =>
    attempt.kind === "popup_open" ||
    attempt.kind === "download" ||
    attempt.kind === "window_open";
  const tolerateBlockedAttempt = (
    attempt: PrepareOnlyBlockedAttempt,
    reason: string,
  ): void => {
    toleratedBlockedAttemptKeys.add(blockedAttemptKey(attempt));
    checkpoints.push({
      id: `checkpoint_${executionInput.job.id}_tolerated_background_request_${toleratedBlockedAttemptKeys.size}`,
      at: new Date().toISOString(),
      label: "Blocked a background page request",
      detail: `The page tried a ${attempt.method} ${attempt.kind.replace(/_/g, " ")} request${
        attempt.url ? ` to ${attempt.url}` : ""
      } ${reason} The request was blocked and nothing was sent; preparation continued.`,
      state: "in_progress",
      visualEvidence: [],
    });
  };
  const unacknowledgedBlockedAttempt = (
    attempt: PrepareOnlyBlockedAttempt | null | undefined,
  ): PrepareOnlyBlockedAttempt | null => {
    if (!attempt) {
      return null;
    }
    if (toleratedBlockedAttemptKeys.has(blockedAttemptKey(attempt))) {
      return null;
    }
    if (isContainmentAttempt(attempt)) {
      return attempt;
    }
    if (!runtimeHasMutatedPage && isPageOwnBackgroundTraffic(attempt)) {
      tolerateBlockedAttempt(
        attempt,
        "on its own before Job Finder touched any field.",
      );
      return null;
    }
    // The page guard saw the form when it blocked the attempt. A request to
    // another origin that carried none of the field values cannot have saved
    // an answer: a widget posting its own form on an untouched page, or an
    // analytics beacon after a fill. Same-origin writes stay stops even when
    // opaque, and anything the guard could not judge is still a stop.
    if (
      attempt.carriedPreparedValue === false &&
      isCrossOriginAttempt(attempt) &&
      (!runtimeHasMutatedPage || isPageOwnBackgroundTraffic(attempt))
    ) {
      tolerateBlockedAttempt(
        attempt,
        runtimeHasMutatedPage
          ? "after fields were prepared; it carried none of the prepared answers."
          : "on its own before Job Finder touched any field; it carried nothing from the page.",
      );
      return null;
    }
    return attempt;
  };
  // A site's delayed save (change fires on blur, or a debounced autosave)
  // can surface only in the settle check after the fill loop. Naming the
  // field it most plausibly belongs to keeps that stop as truthful as the
  // immediate post-fill stop instead of calling it a background request.
  let lastFilledField: {
    kind: ApplicationAttemptQuestion["kind"];
    label: string;
  } | null = null;
  const stopForBlockedAttempt = (
    attempt: PrepareOnlyBlockedAttempt,
  ): ApplyExecutionResult =>
    lastFilledField &&
    !attempt.kind.includes("submit") &&
    isPageOwnBackgroundTraffic(attempt)
      ? buildGuardSafetyStop(attempt, lastFilledField)
      : buildGuardSafetyStop(attempt);
  const loadCurrentResumeBytes = () =>
    loadVerifiedResumeBytes(executionInput.resumeArtifact);

  if (executionInput.recoveryContext?.latestCheckpoint) {
    checkpoints.push({
      id: `checkpoint_${executionInput.job.id}_recovery_context`,
      at: startedAt,
      label: "Resumed from retained apply context",
      detail:
        executionInput.recoveryContext.latestCheckpoint.detail ??
        `Retry resumed after '${executionInput.recoveryContext.latestCheckpoint.label}'.`,
      state: "in_progress",
      visualEvidence:
        executionInput.recoveryContext.retainedVisualEvidence ?? [],
    });
  }

  checkpoints.push({
    id: `checkpoint_${executionInput.job.id}_opened_application_target`,
    at: startedAt,
    label: "Opened exact application target",
    detail: `The Job Finder browser opened ${targetUrl}.`,
    state: "in_progress",
    visualEvidence: [],
  });

  const buildManualSafetyStop = (safetyInput: {
    summary: string;
    detail: string;
    checkpointLabel: string;
    nextActionLabel: string;
    lastUrl?: string | null;
    questionIds?: readonly string[];
  }): ApplyExecutionResult => {
    const lastUrl = safetyInput.lastUrl ?? safePageUrl(currentPage);
    return buildCurrentPreparationResult({
      executionInput,
      summary: safetyInput.summary,
      detail: safetyInput.detail,
      questions: [...questions.values()],
      blocker: {
        code: "requires_manual_review",
        summary: safetyInput.summary,
        detail: safetyInput.detail,
        questionIds: [...(safetyInput.questionIds ?? [])],
        sourceDebugEvidenceRefIds: [],
        url: lastUrl,
      },
      checkpoints,
      checkpointLabel: safetyInput.checkpointLabel,
      checkpointDetail: safetyInput.detail,
      checkpointUrls: [...checkpointUrls],
      lastUrl,
      now: new Date().toISOString(),
      nextActionLabel: safetyInput.nextActionLabel,
    });
  };

  const buildGuardSafetyStop = (
    attempt: PrepareOnlyBlockedAttempt,
    interruptedField?: {
      kind: ApplicationAttemptQuestion["kind"];
      label: string;
    },
  ): ApplyExecutionResult => {
    const resumeInterrupted = interruptedField?.kind === "resume";
    const fieldLabel = interruptedField?.label || "application field";
    const containmentStop =
      attempt.kind === "popup_open" ||
      attempt.kind === "download" ||
      attempt.kind === "window_open";
    const pageRequestStop = !containmentStop && !interruptedField;
    const summary = containmentStop
      ? attempt.kind === "download"
        ? "The application page attempted an unexpected file download"
        : "The application page attempted to open an unexpected popup"
      : pageRequestStop
        ? "The application page needs manual review"
        : resumeInterrupted
          ? "Resume attachment needs your help"
          : "The application page could not safely save a prepared field";
    const containmentDetail =
      attempt.kind === "download"
        ? `The application page tried to start a file download${
            attempt.url ? ` from ${attempt.url}` : ""
          } while preparation was running. The download was canceled, nothing was written outside the managed browser, and the runtime stopped before any further action.`
        : `The application page tried to open a new popup window${
            attempt.url ? ` pointing at ${attempt.url}` : ""
          } while preparation was running. The runtime blocked or immediately closed the popup window and stopped before any further action.`;
    // Naming the blocked attempt lets the user (and a later run's evidence)
    // see what the site tried, without any request body.
    const attemptNote = ` Blocked: ${attempt.kind.replace(/_/g, " ")} ${attempt.method}${
      attempt.url ? ` ${attempt.url}` : ""
    }.`;
    const detail =
      (containmentStop
        ? containmentDetail
        : pageRequestStop
          ? attempt.kind.includes("submit")
            ? "Job Finder blocked a form submission before your review and stopped preparing this application. Review the application in the browser; no submission was made."
            : "Job Finder blocked a background page request before it could continue preparing this application. This does not prove the site tried to save an answer. Review the application in the browser; no submission was made."
          : resumeInterrupted
            ? `The application site tried to upload the approved resume file while '${fieldLabel}' was being prepared, but this run did not have permission for that external save. The blocked attempt transmitted nothing, and the selected file remains only inside the open page. Finish this employer-owned step yourself in the open application, or cancel; Job Finder will still never activate the final submit control.`
            : `The application site tried to save '${fieldLabel}' while it was being prepared, but this run did not have permission for that external save. Job Finder stopped and left the application open instead of risking a final submission.`) +
      attemptNote;
    return buildManualSafetyStop({
      summary,
      detail,
      checkpointLabel: containmentStop
        ? attempt.kind === "download"
          ? "Paused before an unexpected download"
          : "Paused before an unexpected popup"
        : pageRequestStop
          ? attempt.kind.includes("submit")
            ? "Paused before a form submission"
            : "Paused after a blocked background page request"
          : resumeInterrupted
            ? "Paused before the resume could be attached"
            : "Paused before the application field could be saved",
      nextActionLabel:
        containmentStop || pageRequestStop
          ? "Review the open application manually"
          : resumeInterrupted
            ? "Complete the resume step manually in the open application, or cancel"
            : "Complete the affected step manually in the open application, or cancel",
    });
  };

  const serviceWorkerSafetyStopAt = async (
    phase: string,
  ): Promise<ApplyExecutionResult | null> => {
    const finding =
      (await input.sentinel?.check(phase)) ??
      (await findApplicationOriginServiceWorkerIssue({
        context: input.context,
        targetUrl,
        page: currentPage,
        phase,
      }));
    if (!finding) {
      return null;
    }
    const lastUrl = safePageUrl(currentPage);
    const detail = `${finding.detail} The runtime stopped before any further field or click action and left every service-worker registration untouched. Reset the dedicated browser profile from Safeguards, then finish this application manually.`;
    return buildCurrentPreparationResult({
      executionInput,
      summary: "A service worker can influence this application origin",
      detail,
      questions: [...questions.values()],
      blocker: {
        code: "requires_manual_review",
        summary: "A service worker can influence this application origin.",
        detail,
        questionIds: [],
        sourceDebugEvidenceRefIds: [],
        url: lastUrl,
      },
      checkpoints,
      checkpointLabel: "Paused for an application-origin service worker",
      checkpointDetail: detail,
      checkpointUrls: [...checkpointUrls],
      lastUrl,
      now: new Date().toISOString(),
      nextActionLabel:
        "Reset the browser profile, then finish this application manually",
    });
  };

  for (let step = 0; step < MAX_APPLICATION_PREPARATION_STEPS; step += 1) {
    input.signal?.throwIfAborted();
    const ensureServiceWorkerStop =
      await serviceWorkerSafetyStopAt("guard_ensure");
    if (ensureServiceWorkerStop) {
      return ensureServiceWorkerStop;
    }
    try {
      const guard = await ensurePrepareOnlyMutationGuard(
        currentPage,
        executionInput.intermediateMutationsAuthorized === true,
        executionInput.intermediateMutationAllowedOrigins ?? [],
      );
      const existingBlockedAttempt = unacknowledgedBlockedAttempt(
        guard.blockedAttempts.at(-1),
      );
      if (existingBlockedAttempt) {
        return buildGuardSafetyStop(existingBlockedAttempt);
      }
    } catch (error) {
      const detail = `The prepare-only safety guard could not be installed and verified, so the runtime stopped before changing any application field: ${describeUnknownError(error, "Unknown guard installation failure.")}`;
      return buildManualSafetyStop({
        summary: "Prepare-only guard is unavailable",
        detail,
        checkpointLabel: "Stopped before an unguarded page mutation",
        nextActionLabel: "Continue this application manually",
      });
    }

    let inspection: ApplicationPageInspection;
    try {
      inspection = await inspectApplicationPage(currentPage);
    } catch (error) {
      const failureDetail = describeUnknownError(
        error,
        "The current application page could not be inspected.",
      );
      const detail = `The runtime preserved its progress and stopped without submitting because the current page could not be inspected safely: ${failureDetail}`;
      const lastUrl = safePageUrl(currentPage);
      return buildCurrentPreparationResult({
        executionInput,
        summary: "Application page inspection needs manual review",
        detail,
        questions: [...questions.values()],
        blocker: {
          code: "requires_manual_review",
          summary:
            "The current application page could not be inspected safely.",
          detail,
          questionIds: [],
          sourceDebugEvidenceRefIds: [],
          url: lastUrl,
        },
        checkpoints,
        checkpointLabel: "Paused after a page inspection failure",
        checkpointDetail: detail,
        checkpointUrls: [...checkpointUrls],
        lastUrl,
        now: new Date().toISOString(),
        nextActionLabel: "Inspect the current application page manually",
      });
    }
    if (inspection.url && isHttpUrlLike(inspection.url)) {
      checkpointUrls.add(inspection.url);
    }

    if (awaitingFreshPage && inspection.controls.length === 0) {
      await currentPage
        .locator(APPLICATION_FORM_CONTROL_SELECTOR)
        .first()
        .waitFor({ state: "attached", timeout: 10_000 })
        .catch(() => undefined);
      inspection = await inspectApplicationPage(currentPage);
      if (inspection.url && isHttpUrlLike(inspection.url)) {
        checkpointUrls.add(inspection.url);
      }
    }
    awaitingFreshPage = false;

    const pageBlocker = detectPageBlocker(inspection);
    if (pageBlocker) {
      return buildCurrentPreparationResult({
        executionInput,
        summary: pageBlocker.summary,
        detail: pageBlocker.detail,
        questions: [...questions.values()],
        blocker: {
          code: pageBlocker.code,
          summary: pageBlocker.summary,
          detail: pageBlocker.detail,
          questionIds: [],
          sourceDebugEvidenceRefIds: [],
          url: inspection.url,
        },
        checkpoints,
        checkpointLabel: "Paused at a manual application gate",
        checkpointDetail: pageBlocker.detail,
        checkpointUrls: [...checkpointUrls],
        lastUrl: inspection.url,
        now: new Date().toISOString(),
        nextActionLabel: pageBlocker.nextActionLabel,
        manualDecisionLabel: pageBlocker.summary,
      });
    }

    const inspectionSignature = createInspectionSignature(inspection);
    if (seenInspections.has(inspectionSignature)) {
      const detail =
        "The page did not expose a new form state after the previous safe advance. The runtime stopped instead of repeating a control or guessing at page behavior.";
      return buildCurrentPreparationResult({
        executionInput,
        summary: "Application preparation made no safe progress",
        detail,
        questions: [...questions.values()],
        blocker: {
          code: "requires_manual_review",
          summary: "The application page did not advance to a new safe state.",
          detail,
          questionIds: [],
          sourceDebugEvidenceRefIds: [],
          url: inspection.url,
        },
        checkpoints,
        checkpointLabel: "Paused after a repeated application state",
        checkpointDetail: detail,
        checkpointUrls: [...checkpointUrls],
        lastUrl: inspection.url,
        now: new Date().toISOString(),
        nextActionLabel: "Review the current application page manually",
      });
    }
    seenInspections.add(inspectionSignature);

    const filledControlSignatures = new Set<string>();

    const mismatchedQuestions: ApplicationAttemptQuestion[] = [];
    for (const control of inspection.controls) {
      input.signal?.throwIfAborted();
      const resumeUploadControl = isResumeUploadControl(control);
      if (
        (!control.visible && !resumeUploadControl) ||
        control.disabled ||
        control.readOnly ||
        control.inputType === "hidden"
      ) {
        continue;
      }

      const answer = getGroundedControlAnswer({
        control,
        controls: inspection.controls,
        applicationAttachments: executionInput.applicationAttachments,
        profile: executionInput.profile,
        resumeFilePath: executionInput.resumeArtifact.filePath,
        resumeFileName: executionInput.resumeArtifact.fileName,
        resumeArtifactId: executionInput.resumeArtifact.id,
        resumeProvenanceLabel:
          executionInput.resumeArtifact.source === "original_upload"
            ? "Original resume selected by the user"
            : "Approved tailored resume export",
        loadVerifiedResumeBytes: loadCurrentResumeBytes,
      });
      if (!answer || !groundedControlHasPrefillConflict(control, answer)) {
        continue;
      }

      const mismatchQuestion = buildGroundedMismatchQuestion({
        jobId: executionInput.job.id,
        step,
        control,
        answer,
        now: new Date().toISOString(),
      });
      const questionKey = `${mismatchQuestion.kind}:${normalizeControlSignal(mismatchQuestion.prompt)}`;
      questions.set(questionKey, mismatchQuestion);
      mismatchedQuestions.push(mismatchQuestion);
    }
    if (mismatchedQuestions.length > 0) {
      const detail =
        "One or more known application fields already contain values that do not match the exact saved candidate profile. The runtime preserved those values, captured the conflicts for review, and stopped before advancing.";
      return buildManualSafetyStop({
        summary: "Prefilled application values need manual review",
        detail,
        checkpointLabel: "Paused on mismatched prefilled values",
        nextActionLabel: "Review the conflicting application fields manually",
        lastUrl: inspection.url,
        questionIds: mismatchedQuestions.map((question) => question.id),
      });
    }

    const groundedControlSignatures = inspection.controls.flatMap((control) => {
      const resumeUploadControl = isResumeUploadControl(control);
      if (
        (!control.visible && !resumeUploadControl) ||
        control.disabled ||
        control.readOnly ||
        control.inputType === "hidden"
      ) {
        return [];
      }

      const answer = getGroundedControlAnswer({
        control,
        controls: inspection.controls,
        applicationAttachments: executionInput.applicationAttachments,
        profile: executionInput.profile,
        resumeFilePath: executionInput.resumeArtifact.filePath,
        resumeFileName: executionInput.resumeArtifact.fileName,
        resumeArtifactId: executionInput.resumeArtifact.id,
        resumeProvenanceLabel:
          executionInput.resumeArtifact.source === "original_upload"
            ? "Original resume selected by the user"
            : "Approved tailored resume export",
        loadVerifiedResumeBytes: loadCurrentResumeBytes,
      });
      return answer ? [createControlSemanticSignature(control)] : [];
    });

    for (const controlSignature of groundedControlSignatures) {
      let control: InspectedFormControl;
      let currentControls: readonly InspectedFormControl[];

      try {
        const guard = await ensurePrepareOnlyMutationGuard(
          currentPage,
          executionInput.intermediateMutationsAuthorized === true,
          executionInput.intermediateMutationAllowedOrigins ?? [],
        );
        const blockedAttempt = unacknowledgedBlockedAttempt(
          guard.blockedAttempts.at(-1),
        );
        if (blockedAttempt) {
          return buildGuardSafetyStop(blockedAttempt);
        }

        currentControls = await inspectApplicationControls(currentPage);
        const matchingControls = currentControls.filter(
          (candidate) =>
            createControlSemanticSignature(candidate) === controlSignature,
        );
        if (matchingControls.length !== 1) {
          continue;
        }
        control = matchingControls[0]!;
      } catch (error) {
        const detail = `The prepare-only runtime could not verify the current form field before changing it, so it stopped without interacting with that field: ${describeUnknownError(error, "Unknown field verification failure.")}`;
        return buildManualSafetyStop({
          summary: "Application field changed before safe autofill",
          detail,
          checkpointLabel: "Paused before an unverified field mutation",
          nextActionLabel: "Review the current application fields manually",
        });
      }

      const resumeUploadControl = isResumeUploadControl(control);
      if (
        (!control.visible && !resumeUploadControl) ||
        control.disabled ||
        control.readOnly ||
        control.inputType === "hidden"
      ) {
        continue;
      }

      const preFillServiceWorkerStop =
        await serviceWorkerSafetyStopAt("pre_fill");
      if (preFillServiceWorkerStop) {
        return preFillServiceWorkerStop;
      }

      const answer = getGroundedControlAnswer({
        control,
        controls: currentControls,
        applicationAttachments: executionInput.applicationAttachments,
        profile: executionInput.profile,
        resumeFilePath: executionInput.resumeArtifact.filePath,
        resumeFileName: executionInput.resumeArtifact.fileName,
        resumeArtifactId: executionInput.resumeArtifact.id,
        resumeProvenanceLabel:
          executionInput.resumeArtifact.source === "original_upload"
            ? "Original resume selected by the user"
            : "Approved tailored resume export",
        loadVerifiedResumeBytes: loadCurrentResumeBytes,
      });
      if (!answer) {
        continue;
      }

      let fillResult: GroundedControlFillResult | null = null;
      const verifiedExternalWritesBefore =
        getVerifiedIntermediateWriteCount(currentPage);
      // From the first fill attempt on, a blocked request may be the site
      // reacting to the runtime's own input, so tolerance ends here.
      runtimeHasMutatedPage = true;
      try {
        fillResult = await fillGroundedControlWithinPolicy({
          page: currentPage,
          control,
          answer,
          intermediateMutationsAuthorized:
            executionInput.intermediateMutationsAuthorized === true,
          ...(executionInput.recheckIntermediateMutationAuthority
            ? {
                recheckIntermediateMutationAuthority:
                  executionInput.recheckIntermediateMutationAuthority,
              }
            : {}),
        });
      } catch {
        // A required field that could not be filled is captured immediately
        // below as a review question. Optional fields remain untouched.
      }

      let blockedAttempt: PrepareOnlyBlockedAttempt | null;
      try {
        const postFillServiceWorkerStop =
          await serviceWorkerSafetyStopAt("post_fill");
        if (postFillServiceWorkerStop) {
          return postFillServiceWorkerStop;
        }
        blockedAttempt = unacknowledgedBlockedAttempt(
          await getLatestBlockedPrepareOnlyAttempt(currentPage),
        );
      } catch (error) {
        const detail = `The prepare-only safety guard could not be re-verified after a field interaction, so the runtime stopped immediately: ${describeUnknownError(error, "Unknown guard verification failure.")}`;
        return buildManualSafetyStop({
          summary: "Prepare-only guard verification was lost",
          detail,
          checkpointLabel: "Paused after guard verification failed",
          nextActionLabel: "Review the current application manually",
        });
      }
      if (blockedAttempt) {
        return buildGuardSafetyStop(blockedAttempt, {
          kind: answer.kind,
          label: getQuestionPrompt(control),
        });
      }

      if (fillResult === "mismatch") {
        const mismatchQuestion = buildGroundedMismatchQuestion({
          jobId: executionInput.job.id,
          step,
          control,
          answer,
          now: new Date().toISOString(),
        });
        const questionKey = `${mismatchQuestion.kind}:${normalizeControlSignal(mismatchQuestion.prompt)}`;
        questions.set(questionKey, mismatchQuestion);
        mismatchedQuestions.push(mismatchQuestion);
        continue;
      }

      if (fillResult === "filled") {
        lastFilledField = {
          kind: answer.kind,
          label: getQuestionPrompt(control),
        };
      }
      if (fillResult === "filled" || fillResult === "already_matches") {
        filledControlSignatures.add(controlSignature);
        const question = buildGroundedQuestion({
          jobId: executionInput.job.id,
          step,
          control,
          answer,
          now: new Date().toISOString(),
        });
        const questionKey = `${question.kind}:${normalizeControlSignal(question.prompt)}`;
        questions.set(questionKey, question);
        if (
          fillResult === "filled" &&
          getVerifiedIntermediateWriteCount(currentPage) >
            verifiedExternalWritesBefore
        ) {
          const category =
            question.kind === "resume"
              ? ("resume_attachment" as const)
              : control.inputType === "file"
                ? ("application_answer" as const)
                : ["personal_info", "location", "portfolio"].includes(
                      question.kind,
                    )
                  ? ("profile_field" as const)
                  : ("application_answer" as const);
          if (
            !externalWrites.some(
              (entry) =>
                entry.category === category &&
                entry.fieldLabel === question.prompt,
            )
          ) {
            externalWrites.push({
              category,
              fieldLabel: question.prompt,
              occurredAt: question.detectedAt,
              verified: true,
            });
          }
        }
        if (question.kind === "resume") {
          resumeAttached = true;
        }
      }
    }

    try {
      const guard = await ensurePrepareOnlyMutationGuard(
        currentPage,
        executionInput.intermediateMutationsAuthorized === true,
        executionInput.intermediateMutationAllowedOrigins ?? [],
      );
      const blockedAttempt = unacknowledgedBlockedAttempt(
        guard.blockedAttempts.at(-1),
      );
      if (blockedAttempt) {
        return stopForBlockedAttempt(blockedAttempt);
      }
      // File uploads and controlled form widgets can rerender the application
      // form after earlier fields were filled. Give the page a brief settling
      // window, then restore any exact grounded value that was cleared before
      // we declare the form ready for the user.
      await currentPage.waitForTimeout(500);
      let settledControls = await inspectApplicationControls(currentPage);
      for (const inspectedControl of settledControls) {
        if (
          !inspectedControl.visible ||
          inspectedControl.inputType === "file" ||
          inspectedControl.disabled ||
          inspectedControl.readOnly ||
          inspectedControl.inputType === "hidden"
        ) {
          continue;
        }

        const answer = getGroundedControlAnswer({
          control: inspectedControl,
          controls: settledControls,
          applicationAttachments: executionInput.applicationAttachments,
          profile: executionInput.profile,
          resumeFilePath: executionInput.resumeArtifact.filePath,
          resumeFileName: executionInput.resumeArtifact.fileName,
          resumeArtifactId: executionInput.resumeArtifact.id,
          resumeProvenanceLabel:
            executionInput.resumeArtifact.source === "original_upload"
              ? "Original resume selected by the user"
              : "Approved tailored resume export",
          loadVerifiedResumeBytes: loadCurrentResumeBytes,
        });
        if (!answer || groundedAnswerPersisted(inspectedControl, answer)) {
          continue;
        }

        try {
          const valueAfterRemovingSelectedCode = stripSelectedCallingCode(
            inspectedControl.value,
            settledControls,
          );
          const canCorrectDuplicatedPhoneCode =
            answer.kind === "personal_info" &&
            !isPhoneCountryCodeControl(inspectedControl) &&
            valueAfterRemovingSelectedCode !== inspectedControl.value &&
            normalizeControlSignal(valueAfterRemovingSelectedCode) ===
              normalizeControlSignal(answer.value);
          await fillGroundedControlWithinPolicy({
            page: currentPage,
            control: canCorrectDuplicatedPhoneCode
              ? { ...inspectedControl, value: "" }
              : inspectedControl,
            answer,
            intermediateMutationsAuthorized:
              executionInput.intermediateMutationsAuthorized === true,
            ...(executionInput.recheckIntermediateMutationAuthority
              ? {
                  recheckIntermediateMutationAuthority:
                    executionInput.recheckIntermediateMutationAuthority,
                }
              : {}),
          });
        } catch {
          // The persisted-value verification below turns this into a visible
          // manual-review stop instead of reporting a false ready state.
        }
      }
      // Controlled ATS widgets can briefly expose the requested value, clear
      // it during an asynchronous rerender, and restore their committed state
      // after a provider-side validation finishes. Require several consecutive
      // good observations rather than treating the first good frame as stable.
      // Normal forms add only a short quiet-period check. Once a transient
      // mismatch is observed, keep sampling within a bounded recovery window
      // before asking the user to repair a value that the provider may still
      // restore on its own. These samples are read-only and the final-submit
      // guard remains installed throughout.
      let consecutiveStableSamples = 0;
      for (
        let settleAttempt = 0;
        settleAttempt < MAX_TRANSIENT_FORM_SAMPLES;
        settleAttempt += 1
      ) {
        await currentPage.waitForTimeout(FORM_STABILITY_SAMPLE_INTERVAL_MS);
        settledControls = await inspectApplicationControls(currentPage);
        const hasUnpersistedGroundedValue = settledControls.some(
          (candidate) => {
            if (
              !candidate.visible ||
              candidate.disabled ||
              candidate.readOnly ||
              candidate.inputType === "hidden"
            ) {
              return false;
            }
            const candidateAnswer = getGroundedControlAnswer({
              control: candidate,
              controls: settledControls,
              applicationAttachments: executionInput.applicationAttachments,
              profile: executionInput.profile,
              resumeFilePath: executionInput.resumeArtifact.filePath,
              resumeFileName: executionInput.resumeArtifact.fileName,
              resumeArtifactId: executionInput.resumeArtifact.id,
              resumeProvenanceLabel:
                executionInput.resumeArtifact.source === "original_upload"
                  ? "Original resume selected by the user"
                  : "Approved tailored resume export",
              loadVerifiedResumeBytes: loadCurrentResumeBytes,
            });
            return Boolean(
              candidateAnswer &&
              !groundedAnswerPersisted(candidate, candidateAnswer),
            );
          },
        );
        consecutiveStableSamples = hasUnpersistedGroundedValue
          ? 0
          : consecutiveStableSamples + 1;
        if (consecutiveStableSamples >= REQUIRED_STABLE_FORM_SAMPLES) {
          break;
        }
      }

      // Delayed page writes that fire during or after the settle window must
      // prevent a ready-state declaration, so re-read the aggregated guard
      // ledger immediately before trusting the settled form.
      const postSettleServiceWorkerStop =
        await serviceWorkerSafetyStopAt("post_settle");
      if (postSettleServiceWorkerStop) {
        return postSettleServiceWorkerStop;
      }
      const blockedAfterSettle = unacknowledgedBlockedAttempt(
        await getLatestBlockedPrepareOnlyAttempt(currentPage),
      );
      if (blockedAfterSettle) {
        return stopForBlockedAttempt(blockedAfterSettle);
      }

      inspection = await inspectApplicationPage(currentPage);
    } catch (error) {
      const detail = `The application page could not be safely re-inspected after autofill, so the runtime stopped before choosing any page action: ${describeUnknownError(error, "Unknown post-fill inspection failure.")}`;
      return buildManualSafetyStop({
        summary: "Application changed after autofill",
        detail,
        checkpointLabel: "Paused before action selection after autofill",
        nextActionLabel: "Review the current application page manually",
      });
    }
    if (inspection.url && isHttpUrlLike(inspection.url)) {
      checkpointUrls.add(inspection.url);
    }

    if (mismatchedQuestions.length > 0) {
      const detail =
        "One or more known application fields already contain values that do not match the exact saved candidate profile. The runtime preserved those values, captured the conflicts for review, and stopped before advancing.";
      return buildManualSafetyStop({
        summary: "Prefilled application values need manual review",
        detail,
        checkpointLabel: "Paused on mismatched prefilled values",
        nextActionLabel: "Review the conflicting application fields manually",
        lastUrl: inspection.url,
        questionIds: mismatchedQuestions.map((question) => question.id),
      });
    }

    const unpersistedQuestions: ApplicationAttemptQuestion[] = [];
    for (const control of inspection.controls) {
      if (
        !control.visible ||
        control.disabled ||
        control.readOnly ||
        control.inputType === "hidden"
      ) {
        continue;
      }
      const answer = getGroundedControlAnswer({
        control,
        controls: inspection.controls,
        applicationAttachments: executionInput.applicationAttachments,
        profile: executionInput.profile,
        resumeFilePath: executionInput.resumeArtifact.filePath,
        resumeFileName: executionInput.resumeArtifact.fileName,
        resumeArtifactId: executionInput.resumeArtifact.id,
        resumeProvenanceLabel:
          executionInput.resumeArtifact.source === "original_upload"
            ? "Original resume selected by the user"
            : "Approved tailored resume export",
        loadVerifiedResumeBytes: loadCurrentResumeBytes,
      });
      if (!answer || groundedAnswerPersisted(control, answer)) {
        continue;
      }

      const question = buildGroundedMismatchQuestion({
        jobId: executionInput.job.id,
        step,
        control,
        answer,
        now: new Date().toISOString(),
      });
      const questionKey = `${question.kind}:${normalizeControlSignal(question.prompt)}`;
      questions.set(questionKey, question);
      unpersistedQuestions.push(question);
    }

    if (unpersistedQuestions.length > 0) {
      const detail =
        "One or more exact profile fields did not remain filled after the application page finished updating. The runtime retried those fields, verified the visible form, and stopped instead of reporting a false ready state.";
      return buildManualSafetyStop({
        summary: "Prepared application fields need manual review",
        detail,
        checkpointLabel: "Paused after a prepared field was cleared",
        nextActionLabel: "Review the highlighted application fields manually",
        lastUrl: inspection.url,
        questionIds: unpersistedQuestions.map((question) => question.id),
      });
    }

    const filledControlIndexes = new Set(
      inspection.controls
        .filter((control) =>
          filledControlSignatures.has(createControlSemanticSignature(control)),
        )
        .map((control) => control.index),
    );

    const unknownRequiredQuestions = buildUnknownRequiredQuestions({
      jobId: executionInput.job.id,
      step,
      now: new Date().toISOString(),
      controls: inspection.controls,
      filledControlIndexes,
    });
    unknownRequiredQuestions.forEach((question) => {
      const questionKey = `${question.kind}:${normalizeControlSignal(question.prompt)}`;
      questions.set(questionKey, question);
    });

    if (unknownRequiredQuestions.length > 0) {
      const questionIds = unknownRequiredQuestions.map(
        (question) => question.id,
      );
      const detail =
        "The page contains required questions that do not map exactly to grounded profile fields. The runtime preserved them for manual answers and stopped before advancing.";
      return buildCurrentPreparationResult({
        executionInput,
        summary: "Required application questions need manual answers",
        detail,
        questions: [...questions.values()],
        blocker: {
          code: "missing_candidate_answer",
          summary: "Required questions need candidate-provided answers.",
          detail,
          questionIds,
          sourceDebugEvidenceRefIds: [],
          url: inspection.url,
        },
        checkpoints,
        checkpointLabel: "Paused for required application questions",
        checkpointDetail: detail,
        checkpointUrls: [...checkpointUrls],
        lastUrl: inspection.url,
        now: new Date().toISOString(),
        nextActionLabel: "Answer the captured required questions manually",
      });
    }

    const actionableControls = inspection.actions.filter(
      (action) => action.visible && !action.disabled,
    );
    let blockedBeforeCheckpoint: PrepareOnlyBlockedAttempt | null;
    try {
      blockedBeforeCheckpoint = unacknowledgedBlockedAttempt(
        await getLatestBlockedPrepareOnlyAttempt(currentPage),
      );
    } catch (error) {
      const detail = `The prepare-only safety guard could not be re-verified before evaluating final application actions, so the runtime stopped immediately: ${describeUnknownError(error, "Unknown guard verification failure.")}`;
      return buildManualSafetyStop({
        summary: "Prepare-only guard verification was lost",
        detail,
        checkpointLabel: "Paused after guard verification failed",
        nextActionLabel: "Review the current application manually",
      });
    }
    if (blockedBeforeCheckpoint) {
      return stopForBlockedAttempt(blockedBeforeCheckpoint);
    }

    const preReturnServiceWorkerStop =
      await serviceWorkerSafetyStopAt("pre_return");
    if (preReturnServiceWorkerStop) {
      return preReturnServiceWorkerStop;
    }

    const finalAction = actionableControls.find((action) =>
      isFinalApplicationAction(action, inspection),
    );
    if (finalAction) {
      if (!resumeAttached) {
        const detail =
          "A final application control is visible, but the runtime did not locate and attach the current approved resume on this preparation path. It stopped for manual verification.";
        return buildCurrentPreparationResult({
          executionInput,
          summary: "Final checkpoint reached without a verified resume upload",
          detail,
          questions: [...questions.values()],
          blocker: {
            code: "missing_resume",
            summary: "The approved resume upload was not verified.",
            detail,
            questionIds: [],
            sourceDebugEvidenceRefIds: [],
            url: inspection.url,
          },
          checkpoints,
          checkpointLabel: "Stopped at final control for resume verification",
          checkpointDetail: `The runtime identified '${finalAction.label || "an unlabeled submit control"}' and did not click it.`,
          checkpointUrls: [...checkpointUrls],
          lastUrl: inspection.url,
          now: new Date().toISOString(),
          nextActionLabel: "Verify the approved resume, then review manually",
        });
      }

      const authorizationDetail =
        executionInput.submitAuthorized === true
          ? "Even though authorization was supplied, the production runtime remains non-submitting during this acceptance-hardening phase."
          : "No explicit final-submit authorization was supplied.";
      const detail = `The form is prepared through the final visible action '${finalAction.label || "unlabeled submit control"}'. ${authorizationDetail} The runtime did not click the control.`;
      return buildCurrentPreparationResult({
        executionInput,
        summary: "Application prepared at the final pre-submit checkpoint",
        detail,
        questions: [...questions.values()],
        blocker: null,
        checkpoints,
        checkpointLabel: "Paused before final submit",
        checkpointDetail: detail,
        checkpointUrls: [...checkpointUrls],
        lastUrl: inspection.url,
        now: new Date().toISOString(),
        nextActionLabel: "Review the prepared application and submit manually",
      });
    }

    const entryLink = findApplicationEntryLink(inspection);
    const safeAdvance = entryLink
      ? null
      : actionableControls.find((action) =>
          isSafeApplicationAdvance(action, inspection),
        );
    if (entryLink?.href) {
      // Opening the link's destination is the navigation the runtime would
      // make for an application URL. Nothing on this page is prepared, so
      // there is nothing a click could send.
      await currentPage.goto(entryLink.href, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await currentPage
        .waitForLoadState("load", { timeout: 10_000 })
        .catch(() => undefined);
      checkpoints.push({
        id: `checkpoint_${executionInput.job.id}_application_entry_${step + 1}`,
        at: new Date().toISOString(),
        label: `Opened the application from ${entryLink.label}`,
        detail: `Followed the '${entryLink.label}' link on the posting to ${entryLink.href}. No field had been prepared, so nothing could be sent.`,
        state: "in_progress",
        visualEvidence: [],
      });
      checkpointUrls.add(entryLink.href);
      currentPage = await resolveLivePageForContext(input.context, {
        bringToFront: false,
      });
      awaitingFreshPage = true;
      continue;
    }
    if (!safeAdvance) {
      const detail =
        "The page exposes no clearly non-final Next, Continue, or Review control. The runtime stopped instead of guessing which action is safe.";
      return buildCurrentPreparationResult({
        executionInput,
        summary: "Application preparation needs manual navigation",
        detail,
        questions: [...questions.values()],
        blocker: {
          code: "requires_manual_review",
          summary: "No clearly safe non-final control is available.",
          detail,
          questionIds: [],
          sourceDebugEvidenceRefIds: [],
          url: inspection.url,
        },
        checkpoints,
        checkpointLabel: "Paused without a safe advance control",
        checkpointDetail: detail,
        checkpointUrls: [...checkpointUrls],
        lastUrl: inspection.url,
        now: new Date().toISOString(),
        nextActionLabel: "Choose the next application step manually",
      });
    }

    const safeAdvanceSignature = createActionSemanticSignature(safeAdvance);
    try {
      const guard = await ensurePrepareOnlyMutationGuard(currentPage, false);
      const blockedBeforeClick = unacknowledgedBlockedAttempt(
        guard.blockedAttempts.at(-1),
      );
      if (blockedBeforeClick) {
        return stopForBlockedAttempt(blockedBeforeClick);
      }
      const preClickServiceWorkerStop =
        await serviceWorkerSafetyStopAt("pre_advance_click");
      if (preClickServiceWorkerStop) {
        return preClickServiceWorkerStop;
      }

      runtimeHasMutatedPage = true;
      const clickResult = await clickCurrentSafeActionBySignature({
        page: currentPage,
        expectedSignature: safeAdvanceSignature,
      });
      if (clickResult.status !== "clicked") {
        const detail =
          clickResult.status === "unsafe"
            ? "The previously identified continuation control is now submit-capable or semantically final. The runtime did not click it."
            : "The previously identified continuation control changed, disappeared, or became ambiguous before it could be clicked. The runtime did not fall back to a positional locator.";
        return buildManualSafetyStop({
          summary: "Application continuation changed before safe navigation",
          detail,
          checkpointLabel: "Paused before a changed application action",
          nextActionLabel: "Choose the next application step manually",
          lastUrl: inspection.url,
        });
      }

      const blockedAfterClick = unacknowledgedBlockedAttempt(
        await getLatestBlockedPrepareOnlyAttempt(currentPage),
      );
      if (blockedAfterClick) {
        return stopForBlockedAttempt(blockedAfterClick);
      }

      await currentPage
        .waitForLoadState("domcontentloaded", { timeout: 5_000 })
        .catch(() => undefined);
      checkpoints.push({
        id: `checkpoint_${executionInput.job.id}_safe_advance_${step + 1}`,
        at: new Date().toISOString(),
        label: `Advanced with ${clickResult.action.label}`,
        detail: `Clicked the freshly verified non-final '${clickResult.action.label}' control while the prepare-only mutation guard remained active.`,
        state: "in_progress",
        visualEvidence: [],
      });
      currentPage = await resolveLivePageForContext(input.context, {
        bringToFront: false,
      });
      awaitingFreshPage = true;
    } catch (error) {
      const blockedAttempt = await getLatestBlockedPrepareOnlyAttempt(
        currentPage,
      ).catch(() => null);
      if (blockedAttempt) {
        return buildGuardSafetyStop(blockedAttempt);
      }

      const failureDetail = describeUnknownError(
        error,
        `The '${safeAdvance.label}' control could not be advanced safely.`,
      );
      const detail = `The runtime preserved its progress and stopped without submitting after the non-final '${safeAdvance.label}' step failed: ${failureDetail}`;
      const lastUrl = safePageUrl(currentPage);
      return buildCurrentPreparationResult({
        executionInput,
        summary: "Application step needs manual review",
        detail,
        questions: [...questions.values()],
        blocker: {
          code: "requires_manual_review",
          summary: "A non-final application step could not be advanced safely.",
          detail,
          questionIds: [],
          sourceDebugEvidenceRefIds: [],
          url: lastUrl,
        },
        checkpoints,
        checkpointLabel: "Paused after a safe advance failure",
        checkpointDetail: detail,
        checkpointUrls: [...checkpointUrls],
        lastUrl,
        now: new Date().toISOString(),
        nextActionLabel: `Continue past '${safeAdvance.label}' manually`,
      });
    }
  }

  try {
    const blockedAtLimit = unacknowledgedBlockedAttempt(
      await getLatestBlockedPrepareOnlyAttempt(currentPage),
    );
    if (blockedAtLimit) {
      return stopForBlockedAttempt(blockedAtLimit);
    }
    const limitServiceWorkerStop =
      await serviceWorkerSafetyStopAt("step_limit");
    if (limitServiceWorkerStop) {
      return limitServiceWorkerStop;
    }
  } catch (error) {
    const detail = `The prepare-only safety guard could not be re-verified at the step limit, so the runtime stopped without clicking any final action: ${describeUnknownError(error, "Unknown guard verification failure.")}`;
    return buildManualSafetyStop({
      summary: "Prepare-only guard verification was lost",
      detail,
      checkpointLabel: "Paused after guard verification failed",
      nextActionLabel: "Review the current application manually",
    });
  }

  const lastUrl = safePageUrl(currentPage);
  const detail = `The runtime reached its ${MAX_APPLICATION_PREPARATION_STEPS}-step safety limit and stopped without clicking any final action.`;
  return buildCurrentPreparationResult({
    executionInput,
    summary: "Application preparation reached its safe step limit",
    detail,
    questions: [...questions.values()],
    blocker: {
      code: "requires_manual_review",
      summary: "The bounded application preparation loop is exhausted.",
      detail,
      questionIds: [],
      sourceDebugEvidenceRefIds: [],
      url: lastUrl,
    },
    checkpoints,
    checkpointLabel: "Paused at the bounded preparation limit",
    checkpointDetail: detail,
    checkpointUrls: [...checkpointUrls],
    lastUrl,
    now: new Date().toISOString(),
    nextActionLabel: "Review the remaining application steps manually",
  });
}
