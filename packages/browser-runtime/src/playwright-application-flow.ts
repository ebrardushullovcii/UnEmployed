import { resolve } from "node:path";
import type { BrowserContext, Page } from "playwright";
import {
  ApplyExecutionResultSchema,
  type ApplyExecutionResult,
  type ApplicationAttemptBlocker,
  type ApplicationAttemptCheckpoint,
  type ApplicationAttemptQuestion,
  type CandidateProfile,
} from "@unemployed/contracts";
import type { ExecuteApplicationFlowInput } from "./runtime-types";
import { isHttpUrlLike } from "./playwright-browser-runtime-utils";

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
    await page.bringToFront().catch(() => undefined);
  }

  return page;
}

const APPLICATION_FORM_CONTROL_SELECTOR = [
  "input:not([type='button']):not([type='submit']):not([type='reset'])",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[role='textbox'][aria-required='true']",
  "[role='combobox'][aria-required='true']",
  "[role='radio'][aria-required='true']",
  "[role='checkbox'][aria-required='true']",
].join(", ");

const APPLICATION_ACTION_CONTROL_SELECTOR = [
  "button",
  "input[type='button']",
  "input[type='submit']",
  "[role='button']",
  "a[role='button']",
].join(", ");

const MAX_APPLICATION_PREPARATION_STEPS = 8;

export interface PrepareOnlyBlockedAttempt {
  kind:
    | "dom_submit"
    | "form_submit"
    | "form_request_submit"
    | "send_beacon"
    | "fetch"
    | "xhr"
    | "network_request";
  method: string;
  url: string | null;
  at: string;
}

export interface PrepareOnlyGuardSnapshot {
  installed: boolean;
  blockedAttempts: PrepareOnlyBlockedAttempt[];
}

const prepareOnlyNetworkGuardStates = new WeakMap<
  Page,
  {
    blockedAttempts: PrepareOnlyBlockedAttempt[];
    intermediateMutationsAuthorized: boolean;
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
  }

  const pageWindow = window as unknown as Record<string, unknown>;
  const existingState = pageWindow["__unemployedPrepareOnlyMutationGuardV1"] as
    | InternalGuardState
    | undefined;
  const state: InternalGuardState = existingState ?? {
    installed: true,
    blockedAttempts: [],
    intermediateMutationsAuthorized,
    submitListenerInstalled: false,
    formSubmitWrapper: null,
    formRequestSubmitWrapper: null,
    sendBeaconWrapper: null,
    fetchWrapper: null,
    xhrOpenWrapper: null,
    xhrSendWrapper: null,
    xhrMethods: new WeakMap(),
  };
  state.intermediateMutationsAuthorized = intermediateMutationsAuthorized;
  pageWindow["__unemployedPrepareOnlyMutationGuardV1"] = state;

  const normalizeMethod = (value: string | null | undefined): string =>
    (value || "GET").trim().toUpperCase() || "GET";
  const isMutatingMethod = (method: string): boolean =>
    !new Set(["GET", "HEAD", "OPTIONS"]).has(normalizeMethod(method));
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
  ): void => {
    state.blockedAttempts.push({
      kind,
      method: normalizeMethod(method),
      url,
      at: new Date().toISOString(),
    });
    state.blockedAttempts = state.blockedAttempts.slice(-32);
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
        );
      };
    HTMLFormElement.prototype.requestSubmit = guardedRequestSubmit;
    state.formRequestSubmitWrapper = guardedRequestSubmit;
  }

  if (
    typeof navigator.sendBeacon === "function" &&
    navigator.sendBeacon !== state.sendBeaconWrapper
  ) {
    const originalSendBeacon = navigator.sendBeacon.bind(navigator);
    const guardedSendBeacon: typeof navigator.sendBeacon = (url, data) => {
      if (state.intermediateMutationsAuthorized) {
        return originalSendBeacon(url, data);
      }
      recordBlockedAttempt("send_beacon", "POST", normalizeUrl(url));
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
      if (isMutatingMethod(method)) {
        if (state.intermediateMutationsAuthorized) {
          return originalFetch(resource, init);
        }
        recordBlockedAttempt("fetch", method, normalizeUrl(resource));
        return Promise.reject(
          new DOMException(
            "Prepare-only mode blocked a mutating fetch request.",
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
        if (isMutatingMethod(request.method)) {
          if (state.intermediateMutationsAuthorized) {
            originalSend.call(this, body ?? null);
            return;
          }
          recordBlockedAttempt("xhr", request.method, request.url);
          throw new DOMException(
            "Prepare-only mode blocked a mutating XMLHttpRequest.",
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

interface InspectedFormControl {
  index: number;
  tagName: "input" | "textarea" | "select" | "contenteditable";
  inputType: string;
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
  options: string[];
  selectedOptionLabel: string;
}

interface InspectedActionControl {
  index: number;
  label: string;
  type: string;
  visible: boolean;
  disabled: boolean;
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
  kind: ApplicationAttemptQuestion["kind"];
  sourceKind: "profile" | "resume";
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

async function ensurePrepareOnlyMutationGuard(
  page: Page,
  intermediateMutationsAuthorized: boolean,
): Promise<PrepareOnlyGuardSnapshot> {
  let networkGuardState = prepareOnlyNetworkGuardStates.get(page);
  if (!networkGuardState) {
    networkGuardState = {
      blockedAttempts: [],
      intermediateMutationsAuthorized,
    };
    prepareOnlyNetworkGuardStates.set(page, networkGuardState);
    await page.route("**/*", async (route) => {
      const request = route.request();
      const method = request.method().trim().toUpperCase();
      if (
        !networkGuardState!.intermediateMutationsAuthorized &&
        !["GET", "HEAD", "OPTIONS"].includes(method)
      ) {
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
        return;
      }
      await route.continue();
    });
  }
  networkGuardState.intermediateMutationsAuthorized =
    intermediateMutationsAuthorized;

  await page.evaluate(
    installPrepareOnlyMutationGuardInPage,
    intermediateMutationsAuthorized,
  );
  const snapshot = await page.evaluate(readPrepareOnlyMutationGuardInPage);
  if (!snapshot.installed) {
    throw new Error(
      "The prepare-only browser guard could not be verified in the application page.",
    );
  }
  return {
    installed: true,
    blockedAttempts: [
      ...networkGuardState.blockedAttempts,
      ...snapshot.blockedAttempts,
    ],
  };
}

async function getLatestBlockedPrepareOnlyAttempt(
  page: Page,
): Promise<PrepareOnlyBlockedAttempt | null> {
  const snapshot = await page.evaluate(readPrepareOnlyMutationGuardInPage);
  return (
    [
      ...(prepareOnlyNetworkGuardStates.get(page)?.blockedAttempts ?? []),
      ...snapshot.blockedAttempts,
    ].at(-1) ?? null
  );
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

function getGroundedControlAnswer(input: {
  control: InspectedFormControl;
  profile: CandidateProfile;
  resumeFilePath: string;
  resumeArtifactId: string;
  resumeProvenanceLabel: string;
}): GroundedControlAnswer | null {
  const { control, profile } = input;
  const autocomplete = normalizeControlSignal(control.autocomplete);

  if (isResumeUploadControl(control)) {
    return {
      value: input.resumeFilePath,
      kind: "resume",
      sourceKind: "resume",
      sourceId: input.resumeArtifactId,
      provenanceLabel: input.resumeProvenanceLabel,
    };
  }

  if (
    autocomplete === "given name" ||
    hasExactControlSignal(control, FIRST_NAME_SIGNALS)
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
    autocomplete === "family name" ||
    hasExactControlSignal(control, LAST_NAME_SIGNALS)
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
    autocomplete === "name" ||
    hasExactControlSignal(control, FULL_NAME_SIGNALS)
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
  if (
    preferredPhone &&
    (autocomplete === "tel" ||
      autocomplete.startsWith("tel ") ||
      hasExactControlSignal(control, PHONE_SIGNALS))
  ) {
    return {
      value: preferredPhone,
      kind: "personal_info",
      sourceKind: "profile",
      sourceId: profile.id,
      provenanceLabel: "Candidate profile phone",
    };
  }

  if (hasExactControlSignal(control, LOCATION_SIGNALS)) {
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

  if (profile.linkedinUrl && hasExactControlSignal(control, LINKEDIN_SIGNALS)) {
    return {
      value: profile.linkedinUrl,
      kind: "portfolio",
      sourceKind: "profile",
      sourceId: profile.id,
      provenanceLabel: "Candidate profile LinkedIn URL",
    };
  }

  if (profile.githubUrl && hasExactControlSignal(control, GITHUB_SIGNALS)) {
    return {
      value: profile.githubUrl,
      kind: "portfolio",
      sourceKind: "profile",
      sourceId: profile.id,
      provenanceLabel: "Candidate profile GitHub URL",
    };
  }

  if (
    profile.portfolioUrl &&
    hasExactControlSignal(control, PORTFOLIO_SIGNALS)
  ) {
    return {
      value: profile.portfolioUrl,
      kind: "portfolio",
      sourceKind: "profile",
      sourceId: profile.id,
      provenanceLabel: "Candidate profile portfolio URL",
    };
  }

  if (
    profile.personalWebsiteUrl &&
    hasExactControlSignal(control, WEBSITE_SIGNALS)
  ) {
    return {
      value: profile.personalWebsiteUrl,
      kind: "portfolio",
      sourceKind: "profile",
      sourceId: profile.id,
      provenanceLabel: "Candidate profile personal website URL",
    };
  }

  return null;
}

async function inspectApplicationPage(
  page: Page,
): Promise<ApplicationPageInspection> {
  const [controls, actions, bodyText, frameHints] = await Promise.all([
    page
      .locator(APPLICATION_FORM_CONTROL_SELECTOR)
      .evaluateAll((elements): InspectedFormControl[] => {
        const getVisible = (element: HTMLElement): boolean => {
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
            ? group.getAttribute("aria-label")?.trim() ||
                getReferencedText(group)
            : "";
        };

        return elements.map((element, index) => {
          const htmlElement = element as HTMLElement;
          const input = element instanceof HTMLInputElement ? element : null;
          const textarea =
            element instanceof HTMLTextAreaElement ? element : null;
          const select = element instanceof HTMLSelectElement ? element : null;
          const semanticRole =
            element.getAttribute("role")?.toLowerCase() ?? "";
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
            options: select
              ? Array.from(select.options)
                  .map((option) => option.label.trim())
                  .filter(Boolean)
              : [],
            selectedOptionLabel:
              select?.selectedOptions.item(0)?.label.trim() ?? "",
          };
        });
      }),
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

          return {
            index,
            label,
            type: (input?.type ?? button?.type ?? "button").toLowerCase(),
            visible,
            disabled:
              Boolean(input?.disabled ?? button?.disabled) ||
              element.getAttribute("aria-disabled") === "true",
          };
        }),
      ),
    page
      .locator("body")
      .innerText({ timeout: 5_000 })
      .then((text) => text.slice(0, 20_000))
      .catch(() => ""),
    page
      .locator("iframe")
      .evaluateAll((elements) =>
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
          return [[
            element.getAttribute("title"),
            element.getAttribute("name"),
            element.getAttribute("src"),
          ]
            .filter((value): value is string => Boolean(value))
            .join(" ")];
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
  if (!isSafeApplicationAdvance(action)) {
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
    !isSafeApplicationAdvance(handleAction)
  ) {
    return { status: "changed", action: handleAction };
  }

  await handle.click({ timeout: 10_000 });
  return { status: "clicked", action: handleAction };
}

function detectPageBlocker(
  inspection: ApplicationPageInspection,
): DetectedPageBlocker | null {
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
      bodySignal,
    );
  const visibleActionLabels = inspection.actions
    .filter((action) => action.visible && !action.disabled)
    .map((action) => normalizeControlSignal(action.label));
  const hasLoginAction = visibleActionLabels.some((label) =>
    /^(?:sign in|log in|create account|sign up|register)$/u.test(label),
  );
  const hasApplicationAdvanceAction = visibleActionLabels.some((label) =>
    /^(?:next|continue|continue application|save and continue|review|review application)$/u.test(
      label,
    ),
  );

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
  return (
    control.groupLabel ||
    control.label ||
    control.placeholder ||
    control.name ||
    `Required ${control.inputType || control.tagName} field`
  );
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
      control.inputType === "radio" && control.name
        ? input.controls
            .filter(
              (candidate) =>
                candidate.inputType === "radio" &&
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

  return {
    id: questionId,
    prompt,
    kind: input.answer.kind,
    isRequired: input.control.required,
    detectedAt: input.now,
    answerOptions: input.control.options,
    suggestedAnswers: [
      {
        id: `suggested_answer_${questionId}`,
        text: input.answer.value,
        sourceKind: input.answer.sourceKind,
        sourceId: input.answer.sourceId,
        confidenceLabel: "exact profile field",
        provenance: [
          {
            id: `answer_provenance_${questionId}`,
            sourceKind: input.answer.sourceKind,
            sourceId: input.answer.sourceId,
            label: input.answer.provenanceLabel,
            snippet: input.answer.value,
          },
        ],
      },
    ],
    submittedAnswer: input.answer.value,
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

async function fillGroundedControl(input: {
  page: Page;
  control: InspectedFormControl;
  answer: GroundedControlAnswer;
}): Promise<GroundedControlFillResult> {
  const locator = input.page
    .locator(APPLICATION_FORM_CONTROL_SELECTOR)
    .nth(input.control.index);

  if (input.control.inputType === "file") {
    await locator.setInputFiles(input.answer.value);
    return "filled";
  }

  if (["checkbox", "radio"].includes(input.control.inputType)) {
    return "unsupported";
  }

  if (input.control.tagName === "select") {
    const matchingOption = input.control.options.find(
      (option) =>
        normalizeControlSignal(option) ===
        normalizeControlSignal(input.answer.value),
    );
    if (!matchingOption) {
      return "unsupported";
    }

    const normalizedAnswer = normalizeControlSignal(input.answer.value);
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
      normalizedCurrentValue === normalizedAnswer ||
      normalizedSelectedLabel === normalizedAnswer
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
    return normalizeControlSignal(input.control.value) ===
      normalizeControlSignal(input.answer.value)
      ? "already_matches"
      : "mismatch";
  }

  await locator.fill(input.answer.value);
  return "filled";
}

function hasFinalApplicationWording(action: InspectedActionControl): boolean {
  const label = normalizeControlSignal(action.label);
  return /\b(?:submit|send|finish|complete|apply|confirm)\b/u.test(label);
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

function isFinalApplicationAction(
  action: InspectedActionControl,
  inspection: ApplicationPageInspection,
): boolean {
  if (hasFinalApplicationWording(action)) {
    return true;
  }

  return (
    action.type === "submit" && hasFinalApplicationPageEvidence(inspection)
  );
}

function isSafeApplicationAdvance(action: InspectedActionControl): boolean {
  if (action.type === "submit" || hasFinalApplicationWording(action)) {
    return false;
  }

  const label = normalizeControlSignal(action.label);
  return new Set([
    "next",
    "continue",
    "continue application",
    "save and continue",
    "review",
    "review application",
    "continue to review",
    "proceed to review",
    "review and continue",
  ]).has(label);
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
            label: "Use the approved tailored resume for this application",
            status: "approved" as const,
            decidedAt: input.now,
            detail:
              "The approved tailored resume was attached during prepare-only automation.",
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
  });
}

export async function runGenericApplicationPreparation(input: {
  context: BrowserContext;
  page: Page;
  executionInput: ExecuteApplicationFlowInput;
  startedAt: string;
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
  let currentPage = input.page;
  let resumeAttached = false;

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
    detail: `The dedicated Chrome profile opened ${targetUrl}.`,
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
    return buildPreparationResult({
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
  ): ApplyExecutionResult => {
    const mechanism = attempt.kind.replaceAll("_", " ");
    const detail = `The prepare-only safety guard blocked a ${attempt.method} ${mechanism} attempt triggered by the application page. The guarded action was not allowed to reach the network, and automation stopped instead of assuming the page remained safe.`;
    return buildManualSafetyStop({
      summary: "Prepare-only guard blocked a mutating page action",
      detail,
      checkpointLabel: "Paused after the prepare-only guard intervened",
      nextActionLabel: "Review and continue this application manually",
    });
  };

  for (let step = 0; step < MAX_APPLICATION_PREPARATION_STEPS; step += 1) {
    try {
      const guard = await ensurePrepareOnlyMutationGuard(
        currentPage,
        executionInput.intermediateMutationsAuthorized === true,
      );
      const existingBlockedAttempt = guard.blockedAttempts.at(-1) ?? null;
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
      return buildPreparationResult({
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

    if (step === 0 && inspection.controls.length === 0) {
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

    const pageBlocker = detectPageBlocker(inspection);
    if (pageBlocker) {
      return buildPreparationResult({
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
      return buildPreparationResult({
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
    for (const inspectedControl of inspection.controls) {
      const controlSignature = createControlSemanticSignature(inspectedControl);
      let control: InspectedFormControl;

      try {
        const guard = await ensurePrepareOnlyMutationGuard(
          currentPage,
          executionInput.intermediateMutationsAuthorized === true,
        );
        const blockedAttempt = guard.blockedAttempts.at(-1) ?? null;
        if (blockedAttempt) {
          return buildGuardSafetyStop(blockedAttempt);
        }

        const currentInspection = await inspectApplicationPage(currentPage);
        const matchingControls = currentInspection.controls.filter(
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

      const answer = getGroundedControlAnswer({
        control,
        profile: executionInput.profile,
        resumeFilePath: executionInput.resumeArtifact.filePath,
        resumeArtifactId: executionInput.resumeArtifact.id,
        resumeProvenanceLabel:
          executionInput.resumeArtifact.source === "original_upload"
            ? "Original resume selected by the user"
            : "Approved tailored resume export",
      });
      if (!answer) {
        continue;
      }

      let fillResult: GroundedControlFillResult | null = null;
      try {
        fillResult = await fillGroundedControl({
          page: currentPage,
          control,
          answer,
        });
      } catch {
        // A required field that could not be filled is captured immediately
        // below as a review question. Optional fields remain untouched.
      }

      let blockedAttempt: PrepareOnlyBlockedAttempt | null;
      try {
        blockedAttempt = await getLatestBlockedPrepareOnlyAttempt(currentPage);
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
        return buildGuardSafetyStop(blockedAttempt);
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
        if (question.kind === "resume") {
          resumeAttached = true;
        }
      }
    }

    try {
      const guard = await ensurePrepareOnlyMutationGuard(
        currentPage,
        executionInput.intermediateMutationsAuthorized === true,
      );
      const blockedAttempt = guard.blockedAttempts.at(-1) ?? null;
      if (blockedAttempt) {
        return buildGuardSafetyStop(blockedAttempt);
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
      return buildPreparationResult({
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
    const finalAction = actionableControls.find((action) =>
      isFinalApplicationAction(action, inspection),
    );
    if (finalAction) {
      if (!resumeAttached) {
        const detail =
          "A final application control is visible, but the runtime did not locate and attach the current approved resume on this preparation path. It stopped for manual verification.";
        return buildPreparationResult({
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
      return buildPreparationResult({
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

    const safeAdvance = actionableControls.find(isSafeApplicationAdvance);
    if (!safeAdvance) {
      const detail =
        "The page exposes no clearly non-final Next, Continue, or Review control. The runtime stopped instead of guessing which action is safe.";
      return buildPreparationResult({
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
      const guard = await ensurePrepareOnlyMutationGuard(
        currentPage,
        executionInput.intermediateMutationsAuthorized === true,
      );
      const blockedBeforeClick = guard.blockedAttempts.at(-1) ?? null;
      if (blockedBeforeClick) {
        return buildGuardSafetyStop(blockedBeforeClick);
      }

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

      const blockedAfterClick =
        await getLatestBlockedPrepareOnlyAttempt(currentPage);
      if (blockedAfterClick) {
        return buildGuardSafetyStop(blockedAfterClick);
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
      return buildPreparationResult({
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

  const lastUrl = safePageUrl(currentPage);
  const detail = `The runtime reached its ${MAX_APPLICATION_PREPARATION_STEPS}-step safety limit and stopped without clicking any final action.`;
  return buildPreparationResult({
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
