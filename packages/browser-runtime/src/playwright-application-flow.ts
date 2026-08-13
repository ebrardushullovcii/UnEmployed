import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import type { BrowserContext, Page } from "playwright";
import {
  ApplyExecutionResultSchema,
  type ApplyExecutionResult,
  type ApplicationAttemptBlocker,
  type ApplicationAttemptCheckpoint,
  type ApplicationAttemptExternalWriteEvidence,
  type ApplicationAttemptQuestion,
  type CandidateProfile,
} from "@unemployed/contracts";
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
}): GroundedControlAnswer | null {
  const { control, profile } = input;
  const autocomplete = normalizeControlSignal(control.autocomplete);

  if (isResumeUploadControl(control)) {
    return {
      value: input.resumeFilePath,
      fileName: input.resumeFileName,
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

function isFinalApplicationAction(
  action: InspectedActionControl,
  inspection: ApplicationPageInspection,
): boolean {
  if (hasFinalApplicationWording(action)) {
    return true;
  }

  const normalizedLabel = normalizeControlSignal(action.label);
  const applicationFormVisible = inspection.controls.some(
    (control) =>
      control.visible &&
      (control.required || control.invalid || isResumeUploadControl(control)),
  );
  if (
    new Set(["apply", "apply now"]).has(normalizedLabel) &&
    (applicationFormVisible || hasFinalApplicationPageEvidence(inspection))
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
    const summary = resumeInterrupted
      ? "Resume attachment needs your help"
      : "The application page could not safely save a prepared field";
    const detail = resumeInterrupted
      ? `The application site tried to upload the approved CV while '${fieldLabel}' was being prepared, but this run did not have permission for that external save. Your other confirmed fields remain in the open browser. Approve preparation and retry, or attach the selected CV there manually; Job Finder will still never activate the final submit control.`
      : `The application site tried to save '${fieldLabel}' while it was being prepared, but this run did not have permission for that external save. Job Finder stopped and left the application open instead of risking a final submission.`;
    return buildManualSafetyStop({
      summary,
      detail,
      checkpointLabel: resumeInterrupted
        ? "Paused before the resume could be attached"
        : "Paused before the application field could be saved",
      nextActionLabel: resumeInterrupted
        ? "Approve preparation and retry resume attachment"
        : "Review the open application and retry preparation",
    });
  };

  for (let step = 0; step < MAX_APPLICATION_PREPARATION_STEPS; step += 1) {
    input.signal?.throwIfAborted();
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
        );
        const blockedAttempt = guard.blockedAttempts.at(-1) ?? null;
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
        if (fillResult === "filled") {
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
      );
      const blockedAttempt = guard.blockedAttempts.at(-1) ?? null;
      if (blockedAttempt) {
        return buildGuardSafetyStop(blockedAttempt);
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
          await fillGroundedControl({
            page: currentPage,
            control: canCorrectDuplicatedPhoneCode
              ? { ...inspectedControl, value: "" }
              : inspectedControl,
            answer,
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

    const safeAdvance = actionableControls.find((action) =>
      isSafeApplicationAdvance(action, inspection),
    );
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
