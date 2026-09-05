import { createHash } from "node:crypto";
import {
  ApplicationAuthorityOriginSchema,
  SubmissionFinalControlIdentitySchema,
  SubmissionObservationIdentitySchema,
  type SubmissionFinalControlIdentity,
  type SubmissionObservationIdentity,
} from "@unemployed/contracts";
import type { Page } from "playwright";

/**
 * Generic final-control discovery deliberately knows nothing about a provider
 * or an application's answer policy. Product orchestration supplies the
 * authority, preflight, and last-instant veto around these browser hands.
 */
export const APPLICATION_FINAL_CONTROL_SELECTOR =
  "button, input[type='submit'], input[type='image']";

export const applicationFinalControlKindValues = [
  "button",
  "input_submit",
  "input_image",
] as const;
export type ApplicationFinalControlKind =
  (typeof applicationFinalControlKindValues)[number];

export interface ApplicationSafePageUrl {
  readonly origin: string | null;
  readonly safePath: string | null;
}

export interface ApplicationFinalControl {
  readonly identity: SubmissionFinalControlIdentity;
  /** DOM ordinal in the broad selector, never a retained DOM handle. */
  readonly ordinal: number;
  readonly kind: ApplicationFinalControlKind;
  readonly label: string;
  readonly formIndex: number;
  readonly action: ApplicationSafePageUrl;
}

export interface ApplicationFormObservation {
  readonly identity: SubmissionObservationIdentity;
  readonly page: ApplicationSafePageUrl;
  /** False when the bounded browser enumeration could not prove completeness. */
  readonly complete: boolean;
  readonly controls: readonly ApplicationFinalControl[];
}

export type ApplicationFinalActionBlockReason =
  | "aborted"
  | "action_error"
  | "ambiguous_final_controls"
  | "no_final_control"
  | "origin_drift"
  | "stale_control"
  | "stale_observation"
  | "vetoed";

export interface ApplicationExternalActionFacts {
  /** True once the one-shot action boundary was attempted, even if Playwright
   * failed before dispatching a click. This is separate from actionIssued so
   * uncertainty can suppress retries without claiming an external action. */
  readonly actionAttempted: boolean;
  readonly actionIssued: boolean;
  readonly actionCompleted: boolean;
  readonly pageBefore: ApplicationSafePageUrl;
  readonly pageAfter: ApplicationSafePageUrl;
  readonly urlChanged: boolean;
  /** Network observation is descriptive only and never proves submission. */
  readonly requestsObservedDuringAction: number;
}

export type ApplicationFinalActionResult =
  | {
      readonly outcome: "not_submitted";
      readonly reason: ApplicationFinalActionBlockReason;
      readonly observation: ApplicationFormObservation | null;
      readonly control: ApplicationFinalControl | null;
      readonly facts: ApplicationExternalActionFacts;
    }
  | {
      /**
       * A click was issued, but browser-local facts cannot establish the
       * employer-site outcome. The caller must persist this as uncertain and
       * obtain independent external evidence before any terminal resolution.
       */
      readonly outcome: "outcome_uncertain";
      readonly reason: "action_issued" | "action_error";
      readonly observation: ApplicationFormObservation;
      readonly control: ApplicationFinalControl;
      readonly facts: ApplicationExternalActionFacts;
    };

export interface ObserveApplicationFormOptions {
  /** Optional cap against pathological pages; the default is intentionally bounded. */
  readonly maxControls?: number;
}

export interface ExecuteExactlyOneFinalActionInput {
  readonly expectedObservation: SubmissionObservationIdentity;
  readonly expectedControl: SubmissionFinalControlIdentity;
  /** Current page origin captured by the preflight; origin scope is separate. */
  readonly expectedPageOrigin: string;
  readonly allowedOrigins: readonly string[];
  /** Last-instant deterministic veto; omission is a fail-closed type error. */
  readonly veto: (input: {
    readonly observation: ApplicationFormObservation;
    readonly control: ApplicationFinalControl;
  }) => boolean | Promise<boolean>;
  readonly signal?: AbortSignal;
  readonly clickTimeoutMs?: number;
}

interface RawApplicationControl {
  ordinal: number;
  kind: ApplicationFinalControlKind;
  label: string;
  formIndex: number;
  actionOrigin: string | null;
  actionPath: string | null;
}

interface RawApplicationFormSnapshot {
  pageOrigin: string | null;
  pagePath: string | null;
  complete: boolean;
  controls: RawApplicationControl[];
}

const DEFAULT_MAX_CONTROLS = 500;
const DEFAULT_CLICK_TIMEOUT_MS = 5_000;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function readSafePageUrl(value: string): ApplicationSafePageUrl {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { origin: null, safePath: null };
    }
    return {
      origin: url.origin,
      safePath: url.pathname.startsWith("/") ? url.pathname : "/",
    };
  } catch {
    return { origin: null, safePath: null };
  }
}

function normalizeAllowedOrigin(value: string): string | null {
  try {
    return ApplicationAuthorityOriginSchema.parse(value).replace(/\/$/u, "");
  } catch {
    return null;
  }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

function isApplicationFinalControlKind(
  value: unknown,
): value is ApplicationFinalControlKind {
  return (
    typeof value === "string" &&
    (applicationFinalControlKindValues as readonly string[]).includes(value)
  );
}

function isRawApplicationControl(
  value: unknown,
): value is RawApplicationControl {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    Number.isInteger(record.ordinal) &&
    (record.ordinal as number) >= 0 &&
    isApplicationFinalControlKind(record.kind) &&
    typeof record.label === "string" &&
    Number.isInteger(record.formIndex) &&
    (record.formIndex as number) >= 0 &&
    (typeof record.actionOrigin === "string" || record.actionOrigin === null) &&
    (typeof record.actionPath === "string" || record.actionPath === null)
  );
}

function isRawApplicationFormSnapshot(
  value: unknown,
): value is RawApplicationFormSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    (typeof record.pageOrigin === "string" || record.pageOrigin === null) &&
    (typeof record.pagePath === "string" || record.pagePath === null) &&
    typeof record.complete === "boolean" &&
    Array.isArray(record.controls) &&
    record.controls.every(isRawApplicationControl)
  );
}

function assertRawApplicationFormSnapshot(
  value: unknown,
): asserts value is RawApplicationFormSnapshot {
  if (!isRawApplicationFormSnapshot(value)) {
    throw new Error(
      "Browser returned an invalid application form observation.",
    );
  }
}

function buildControl(raw: RawApplicationControl): ApplicationFinalControl {
  const action: ApplicationSafePageUrl = {
    origin: raw.actionOrigin,
    safePath: raw.actionPath,
  };
  const ref = `final-control-${raw.ordinal}`;
  const signature = sha256(
    canonicalJson({
      action,
      formIndex: raw.formIndex,
      kind: raw.kind,
      label: raw.label,
      ordinal: raw.ordinal,
      ref,
    }),
  );
  return {
    identity: SubmissionFinalControlIdentitySchema.parse({
      ref,
      signature,
    }),
    ordinal: raw.ordinal,
    kind: raw.kind,
    label: raw.label,
    formIndex: raw.formIndex,
    action,
  };
}

function buildObservation(
  raw: RawApplicationFormSnapshot,
): ApplicationFormObservation {
  const page: ApplicationSafePageUrl = {
    origin: raw.pageOrigin,
    safePath: raw.pagePath,
  };
  const controls = raw.controls.map(buildControl);
  const digest = sha256(
    canonicalJson({
      controls: controls.map((control) => ({
        action: control.action,
        formIndex: control.formIndex,
        identity: control.identity,
        kind: control.kind,
        label: control.label,
        ordinal: control.ordinal,
      })),
      complete: raw.complete,
      page,
    }),
  );
  return {
    identity: SubmissionObservationIdentitySchema.parse({
      digest,
      id: `application-observation-${digest}`,
      revision: 1,
    }),
    page,
    complete: raw.complete,
    controls,
  };
}

async function readRawApplicationFormSnapshot(
  page: Page,
  maxControls: number,
): Promise<RawApplicationFormSnapshot> {
  const raw: unknown = await page.evaluate(
    ({ selector, limit }) => {
      const normalize = (value: string): string =>
        value.replace(/\s+/gu, " ").trim().slice(0, 200);
      const isVisible = (element: Element): boolean => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity || "1") > 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const labelFor = (element: Element): string =>
        normalize(
          [
            element.getAttribute("aria-label"),
            element.getAttribute("title"),
            element.getAttribute("value"),
            element.textContent,
            element.getAttribute("name"),
          ]
            .filter((value): value is string => typeof value === "string")
            .join(" "),
        );
      const pageUrl = new URL(window.location.href);
      const controls: RawApplicationControl[] = [];
      let complete = true;
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(selector),
      );
      candidates.forEach((element, ordinal) => {
        const form = (element as HTMLButtonElement | HTMLInputElement).form;
        if (!form || !isVisible(element) || element.matches(":disabled")) {
          return;
        }
        if (element.getAttribute("aria-disabled") === "true") {
          return;
        }
        const tagName = element.tagName.toLowerCase();
        const type = (element.getAttribute("type") ?? "").toLowerCase();
        const kind: ApplicationFinalControlKind | null =
          tagName === "button" && (type === "" || type === "submit")
            ? "button"
            : tagName === "input" && type === "submit"
              ? "input_submit"
              : tagName === "input" && type === "image"
                ? "input_image"
                : null;
        if (!kind) {
          return;
        }
        if (controls.length >= limit) {
          complete = false;
          return;
        }
        let actionUrl: URL;
        try {
          actionUrl = new URL(
            element.getAttribute("formaction") ??
              form.getAttribute("action") ??
              pageUrl.href,
            document.baseURI,
          );
        } catch {
          actionUrl = new URL("about:blank");
        }
        const isHttpAction =
          actionUrl.protocol === "http:" || actionUrl.protocol === "https:";
        controls.push({
          ordinal,
          kind,
          label: labelFor(element),
          formIndex: Array.from(document.forms).indexOf(form),
          actionOrigin: isHttpAction ? actionUrl.origin : null,
          actionPath: isHttpAction ? actionUrl.pathname : null,
        });
      });
      return {
        pageOrigin:
          pageUrl.protocol === "http:" || pageUrl.protocol === "https:"
            ? pageUrl.origin
            : null,
        pagePath:
          pageUrl.protocol === "http:" || pageUrl.protocol === "https:"
            ? pageUrl.pathname
            : null,
        complete,
        controls,
      } satisfies RawApplicationFormSnapshot;
    },
    { selector: APPLICATION_FINAL_CONTROL_SELECTOR, limit: maxControls },
  );
  assertRawApplicationFormSnapshot(raw);
  return raw;
}

function emptyFacts(
  page: ApplicationSafePageUrl,
): ApplicationExternalActionFacts {
  return {
    actionAttempted: false,
    actionIssued: false,
    actionCompleted: false,
    pageBefore: page,
    pageAfter: page,
    urlChanged: false,
    requestsObservedDuringAction: 0,
  };
}

function sameIdentity(
  left: SubmissionObservationIdentity,
  right: SubmissionObservationIdentity,
): boolean {
  return (
    left.id === right.id &&
    left.revision === right.revision &&
    left.digest === right.digest
  );
}

function sameControlIdentity(
  left: SubmissionFinalControlIdentity,
  right: SubmissionFinalControlIdentity,
): boolean {
  return left.ref === right.ref && left.signature === right.signature;
}

function blockedResult(input: {
  reason: ApplicationFinalActionBlockReason;
  observation: ApplicationFormObservation | null;
  control?: ApplicationFinalControl | null;
  facts: ApplicationExternalActionFacts;
}): ApplicationFinalActionResult {
  return {
    outcome: "not_submitted",
    reason: input.reason,
    observation: input.observation,
    control: input.control ?? null,
    facts: input.facts,
  };
}

const pageExecutionLocks = new WeakMap<object, Promise<void>>();
const pageActionKeys = new WeakMap<object, Set<string>>();

function actionKey(
  observation: SubmissionObservationIdentity,
  control: SubmissionFinalControlIdentity,
): string {
  return `${observation.id}:${observation.revision}:${observation.digest}:${control.ref}:${control.signature}`;
}

function hasIssuedAction(page: Page, key: string): boolean {
  return pageActionKeys.get(page)?.has(key) ?? false;
}

function rememberIssuedAction(page: Page, key: string): void {
  const keys = pageActionKeys.get(page) ?? new Set<string>();
  keys.add(key);
  pageActionKeys.set(page, keys);
}

async function withPageExecutionLock<TValue>(
  page: Page,
  operation: () => Promise<TValue>,
): Promise<TValue> {
  const previous = pageExecutionLocks.get(page) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  pageExecutionLocks.set(page, current);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (pageExecutionLocks.get(page) === current) {
      pageExecutionLocks.delete(page);
    }
  }
}

/**
 * Observe all visible, enabled form final controls. The result is transient
 * and contains no DOM handles, selectors, credentials, or raw page markup.
 */
export async function observeApplicationForm(
  page: Page,
  options?: ObserveApplicationFormOptions,
): Promise<ApplicationFormObservation> {
  const requestedMaxControls = options?.maxControls;
  const maxControls =
    requestedMaxControls === undefined
      ? DEFAULT_MAX_CONTROLS
      : Number.isFinite(requestedMaxControls) &&
          Number.isInteger(requestedMaxControls)
        ? Math.max(1, Math.min(requestedMaxControls, DEFAULT_MAX_CONTROLS))
        : DEFAULT_MAX_CONTROLS;
  return buildObservation(
    await readRawApplicationFormSnapshot(page, maxControls),
  );
}

/**
 * Re-observe, validate exact identity/origin, run the immediate veto, and
 * issue at most one final-control click. A click never becomes `submitted`:
 * this boundary returns uncertainty until an external verifier supplies proof.
 */
export async function executeExactlyOneFinalAction(
  page: Page,
  input: ExecuteExactlyOneFinalActionInput,
): Promise<ApplicationFinalActionResult> {
  const expectedObservation = SubmissionObservationIdentitySchema.parse(
    input.expectedObservation,
  );
  const expectedControl = SubmissionFinalControlIdentitySchema.parse(
    input.expectedControl,
  );

  return withPageExecutionLock(page, async () => {
    const initialPage = readSafePageUrl(page.url());
    const initialFacts = emptyFacts(initialPage);
    if (input.signal?.aborted) {
      return blockedResult({
        reason: "aborted",
        observation: null,
        facts: initialFacts,
      });
    }
    if (typeof input.veto !== "function") {
      return blockedResult({
        reason: "vetoed",
        observation: null,
        facts: initialFacts,
      });
    }

    let observation: ApplicationFormObservation;
    try {
      observation = await observeApplicationForm(page);
    } catch {
      return blockedResult({
        reason: "stale_observation",
        observation: null,
        facts: initialFacts,
      });
    }

    const currentPageOrigin = observation.page.origin;
    const expectedOrigin = normalizeAllowedOrigin(input.expectedPageOrigin);
    const allowedOrigins = new Set(
      input.allowedOrigins
        .map(normalizeAllowedOrigin)
        .filter((origin): origin is string => origin !== null),
    );
    if (
      expectedOrigin === null ||
      currentPageOrigin === null ||
      currentPageOrigin !== expectedOrigin ||
      !allowedOrigins.has(currentPageOrigin)
    ) {
      return blockedResult({
        reason: "origin_drift",
        observation,
        facts: emptyFacts(initialPage),
      });
    }

    if (!sameIdentity(observation.identity, expectedObservation)) {
      return blockedResult({
        reason: "stale_observation",
        observation,
        facts: emptyFacts(initialPage),
      });
    }
    if (observation.controls.length === 0) {
      return blockedResult({
        reason: "no_final_control",
        observation,
        facts: emptyFacts(initialPage),
      });
    }
    if (observation.controls.length !== 1) {
      return blockedResult({
        reason: "ambiguous_final_controls",
        observation,
        facts: emptyFacts(initialPage),
      });
    }
    if (!observation.complete) {
      return blockedResult({
        reason: "ambiguous_final_controls",
        observation,
        facts: emptyFacts(initialPage),
      });
    }

    const control = observation.controls[0];
    if (!control || !sameControlIdentity(control.identity, expectedControl)) {
      return blockedResult({
        reason: "stale_control",
        observation,
        control: control ?? null,
        facts: emptyFacts(initialPage),
      });
    }
    const key = actionKey(expectedObservation, expectedControl);
    if (hasIssuedAction(page, key)) {
      return blockedResult({
        reason: "stale_observation",
        observation,
        control,
        facts: emptyFacts(initialPage),
      });
    }
    if (
      control.action.origin === null ||
      !allowedOrigins.has(control.action.origin)
    ) {
      return blockedResult({
        reason: "origin_drift",
        observation,
        control,
        facts: emptyFacts(initialPage),
      });
    }

    try {
      if (!(await input.veto({ observation, control }))) {
        return blockedResult({
          reason: "vetoed",
          observation,
          control,
          facts: emptyFacts(initialPage),
        });
      }
    } catch {
      return blockedResult({
        reason: "vetoed",
        observation,
        control,
        facts: emptyFacts(initialPage),
      });
    }

    if (input.signal?.aborted) {
      return blockedResult({
        reason: "aborted",
        observation,
        control,
        facts: emptyFacts(initialPage),
      });
    }

    // The veto may itself trigger a rerender. Re-observe after it and before
    // obtaining a locator so a stale control can never be clicked.
    let finalObservation: ApplicationFormObservation;
    try {
      finalObservation = await observeApplicationForm(page);
    } catch {
      return blockedResult({
        reason: "stale_observation",
        observation,
        control,
        facts: emptyFacts(initialPage),
      });
    }
    const finalPage = readSafePageUrl(page.url());
    if (
      finalPage.origin !== expectedOrigin ||
      finalPage.origin === null ||
      !allowedOrigins.has(finalPage.origin)
    ) {
      return blockedResult({
        reason: "origin_drift",
        observation: finalObservation,
        control: finalObservation.controls[0] ?? null,
        facts: emptyFacts(initialPage),
      });
    }
    if (!sameIdentity(finalObservation.identity, expectedObservation)) {
      return blockedResult({
        reason: "stale_observation",
        observation: finalObservation,
        control: finalObservation.controls[0] ?? null,
        facts: emptyFacts(initialPage),
      });
    }
    if (finalObservation.controls.length === 0) {
      return blockedResult({
        reason: "no_final_control",
        observation: finalObservation,
        facts: emptyFacts(initialPage),
      });
    }
    if (finalObservation.controls.length !== 1) {
      return blockedResult({
        reason: "ambiguous_final_controls",
        observation: finalObservation,
        facts: emptyFacts(initialPage),
      });
    }
    if (!finalObservation.complete) {
      return blockedResult({
        reason: "ambiguous_final_controls",
        observation: finalObservation,
        facts: emptyFacts(initialPage),
      });
    }
    const finalControl = finalObservation.controls[0];
    if (
      !finalControl ||
      !sameControlIdentity(finalControl.identity, expectedControl)
    ) {
      return blockedResult({
        reason: "stale_control",
        observation: finalObservation,
        control: finalControl ?? null,
        facts: emptyFacts(initialPage),
      });
    }

    const locator = page
      .locator(APPLICATION_FINAL_CONTROL_SELECTOR)
      .nth(finalControl.ordinal);
    let liveControlMatches = false;
    try {
      const liveControl = await locator.evaluate(
        (element, input): RawApplicationControl | null => {
          if (!(element instanceof HTMLElement)) return null;
          const form = (element as HTMLButtonElement | HTMLInputElement).form;
          if (!form || element.matches(":disabled")) return null;
          const isVisible = (candidate: Element): boolean => {
            const style = window.getComputedStyle(candidate);
            const rect = candidate.getBoundingClientRect();
            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              Number(style.opacity || "1") > 0 &&
              rect.width > 0 &&
              rect.height > 0
            );
          };
          if (
            !isVisible(element) ||
            element.getAttribute("aria-disabled") === "true"
          ) {
            return null;
          }
          const candidates = Array.from(
            document.querySelectorAll<HTMLElement>(input.selector),
          );
          if (candidates.indexOf(element) !== input.ordinal) return null;
          const tagName = element.tagName.toLowerCase();
          const type = (element.getAttribute("type") ?? "").toLowerCase();
          const kind: ApplicationFinalControlKind | null =
            tagName === "button" && (type === "" || type === "submit")
              ? "button"
              : tagName === "input" && type === "submit"
                ? "input_submit"
                : tagName === "input" && type === "image"
                  ? "input_image"
                  : null;
          if (!kind) return null;
          const normalize = (value: string): string =>
            value.replace(/\s+/gu, " ").trim().slice(0, 200);
          const label = normalize(
            [
              element.getAttribute("aria-label"),
              element.getAttribute("title"),
              element.getAttribute("value"),
              element.textContent,
              element.getAttribute("name"),
            ]
              .filter((value): value is string => typeof value === "string")
              .join(" "),
          );
          const pageUrl = new URL(window.location.href);
          let actionUrl: URL;
          try {
            actionUrl = new URL(
              element.getAttribute("formaction") ??
                form.getAttribute("action") ??
                pageUrl.href,
              document.baseURI,
            );
          } catch {
            return null;
          }
          const isHttpAction =
            actionUrl.protocol === "http:" || actionUrl.protocol === "https:";
          return {
            ordinal: input.ordinal,
            kind,
            label,
            formIndex: Array.from(document.forms).indexOf(form),
            actionOrigin: isHttpAction ? actionUrl.origin : null,
            actionPath: isHttpAction ? actionUrl.pathname : null,
          };
        },
        {
          selector: APPLICATION_FINAL_CONTROL_SELECTOR,
          ordinal: finalControl.ordinal,
        },
      );
      liveControlMatches =
        liveControl !== null &&
        liveControl.ordinal === finalControl.ordinal &&
        liveControl.kind === finalControl.kind &&
        liveControl.label === finalControl.label &&
        liveControl.formIndex === finalControl.formIndex &&
        liveControl.actionOrigin === finalControl.action.origin &&
        liveControl.actionPath === finalControl.action.safePath;
    } catch {
      liveControlMatches = false;
    }
    if (!liveControlMatches) {
      return blockedResult({
        reason: "stale_control",
        observation: finalObservation,
        control: finalControl,
        facts: emptyFacts(initialPage),
      });
    }

    const pageBefore = readSafePageUrl(page.url());
    if (
      pageBefore.origin !== expectedOrigin ||
      pageBefore.origin === null ||
      !allowedOrigins.has(pageBefore.origin)
    ) {
      return blockedResult({
        reason: "origin_drift",
        observation: finalObservation,
        control: finalControl,
        facts: emptyFacts(initialPage),
      });
    }

    // Run the veto again after every awaited observation and live-control
    // check. The first veto above is allowed to trigger a rerender; this one
    // is the final positive authorization immediately before the click.
    try {
      if (
        !(await input.veto({
          observation: finalObservation,
          control: finalControl,
        }))
      ) {
        return blockedResult({
          reason: "vetoed",
          observation: finalObservation,
          control: finalControl,
          facts: emptyFacts(initialPage),
        });
      }
    } catch {
      return blockedResult({
        reason: "vetoed",
        observation: finalObservation,
        control: finalControl,
        facts: emptyFacts(initialPage),
      });
    }

    // A veto may have changed the top-level location. Re-check this
    // synchronous fact after the final veto before crossing the action
    // boundary; the effective submitter destination was already re-observed
    // above using formaction/form action precedence.
    const pageAfterVeto = readSafePageUrl(page.url());
    if (
      pageAfterVeto.origin !== expectedOrigin ||
      pageAfterVeto.origin === null ||
      !allowedOrigins.has(pageAfterVeto.origin)
    ) {
      return blockedResult({
        reason: "origin_drift",
        observation: finalObservation,
        control: finalControl,
        facts: emptyFacts(initialPage),
      });
    }

    // Re-observe after the final veto as well. This closes the specific case
    // where the veto callback changes the submitter's effective formaction;
    // the destination must still be the exact, allowed control we approved.
    let postVetoObservation: ApplicationFormObservation;
    try {
      postVetoObservation = await observeApplicationForm(page);
    } catch {
      return blockedResult({
        reason: "stale_observation",
        observation: finalObservation,
        control: finalControl,
        facts: emptyFacts(initialPage),
      });
    }
    if (
      !sameIdentity(postVetoObservation.identity, expectedObservation) ||
      postVetoObservation.controls.length !== 1 ||
      !postVetoObservation.complete
    ) {
      return blockedResult({
        reason: "stale_observation",
        observation: postVetoObservation,
        control: postVetoObservation.controls[0] ?? null,
        facts: emptyFacts(initialPage),
      });
    }
    const postVetoControl = postVetoObservation.controls[0];
    if (
      !postVetoControl ||
      !sameControlIdentity(postVetoControl.identity, expectedControl)
    ) {
      return blockedResult({
        reason: "stale_control",
        observation: postVetoObservation,
        control: postVetoControl ?? null,
        facts: emptyFacts(initialPage),
      });
    }
    if (
      postVetoControl.action.origin === null ||
      !allowedOrigins.has(postVetoControl.action.origin)
    ) {
      return blockedResult({
        reason: "origin_drift",
        observation: postVetoObservation,
        control: postVetoControl,
        facts: emptyFacts(initialPage),
      });
    }
    const postVetoLocator = page
      .locator(APPLICATION_FINAL_CONTROL_SELECTOR)
      .nth(postVetoControl.ordinal);

    // Consume this page/observation/control tuple before entering Playwright.
    // A timeout or a black-holed request is therefore not retried by a second
    // caller that happens to hold the same preflight.
    rememberIssuedAction(page, key);
    let requestsObservedDuringAction = 0;
    const requestListener = (): void => {
      requestsObservedDuringAction += 1;
    };
    page.on("request", requestListener);
    let actionCompleted = false;
    try {
      await postVetoLocator.click({
        noWaitAfter: true,
        timeout: input.clickTimeoutMs ?? DEFAULT_CLICK_TIMEOUT_MS,
      });
      actionCompleted = true;
    } catch {
      const pageAfterError = readSafePageUrl(page.url());
      page.off("request", requestListener);
      return {
        outcome: "outcome_uncertain",
        reason: "action_error",
        observation: finalObservation,
        control: finalControl,
        facts: {
          actionAttempted: true,
          actionIssued: false,
          actionCompleted: false,
          pageBefore,
          pageAfter: pageAfterError,
          urlChanged:
            pageBefore.origin !== pageAfterError.origin ||
            pageBefore.safePath !== pageAfterError.safePath,
          requestsObservedDuringAction,
        },
      };
    }
    page.off("request", requestListener);
    const pageAfter = readSafePageUrl(page.url());
    return {
      outcome: "outcome_uncertain",
      reason: "action_issued",
      observation: finalObservation,
      control: finalControl,
      facts: {
        actionAttempted: true,
        actionIssued: true,
        actionCompleted,
        pageBefore,
        pageAfter,
        urlChanged:
          pageBefore.origin !== pageAfter.origin ||
          pageBefore.safePath !== pageAfter.safePath,
        requestsObservedDuringAction,
      },
    };
  });
}
