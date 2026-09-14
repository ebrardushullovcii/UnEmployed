/**
 * The raw shape of an application form, before any product meaning.
 *
 * These types are the seam between the browser layer, which can read and write
 * a page, and the workflow layer, which decides what any of it means. The
 * browser layer implements `ApplyRawPageHands`; nothing below that layer ever
 * needs to know what a resume field or a consent checkbox is.
 *
 * Nothing here crosses preload or IPC, so these are plain types rather than
 * schemas: the values are transient page reads, not persisted state.
 */

export interface RawApplyControl {
  /** Position among the form controls on the page. Refs are built from this. */
  index: number;
  tagName: string;
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

export interface RawApplyAction {
  index: number;
  label: string;
  visible: boolean;
  disabled: boolean;
}

export interface RawApplyPage {
  url: string | null;
  title: string | null;
  bodyText: string;
  controls: RawApplyControl[];
  actions: RawApplyAction[];
  validationErrors: string[];
  stepLabel: string | null;
}

export type ApplyWriteResult =
  | { ok: true; observedValue: string }
  | { ok: false; error: string };

/** One file, already verified by whoever owns it, on its way into a form. */
export interface ApplyUploadFile {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

/**
 * Reading and writing one open application page.
 *
 * Implemented by the browser layer over its own page handle, which never
 * leaves that layer. Every method is a mechanic: none of them chooses a
 * control, an answer, or whether a write is allowed.
 */
export interface ApplyRawPageHands {
  readPage: () => Promise<RawApplyPage>;
  fillText: (ref: string, value: string) => Promise<ApplyWriteResult>;
  chooseOption: (ref: string, optionLabel: string) => Promise<ApplyWriteResult>;
  setToggle: (ref: string, checked: boolean) => Promise<ApplyWriteResult>;
  uploadFile: (ref: string, file: ApplyUploadFile) => Promise<ApplyWriteResult>;
  clickAction: (ref: string) => Promise<ApplyWriteResult>;
}

/**
 * An attempt the prepare-only guard stopped.
 *
 * During a run that may only fill a form in, nothing may be transmitted. When
 * the page tries anyway, the guard blocks it and records this. Some of these
 * are the page's own background noise; one of them can be the site saving an
 * answer that was just typed, which is a reason to stop and tell the person.
 */
export interface ApplyBlockedAttempt {
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
   * blocked. Set by the page guard, which can see the form; absent for
   * network-layer blocks, which are then treated as if they might have.
   */
  carriedPreparedValue?: boolean;
}

/** A service worker that could influence the application origin. */
export interface ApplyServiceWorkerFinding {
  reason: string;
  summary: string;
  detail: string;
}

/**
 * One open application page, with the safety mechanics that go with it.
 *
 * The browser layer owns the page and implements this. The workflow layer
 * reads and writes through it and asks it, after every write, whether the
 * guard stopped something. Neither layer can skip the other: there is no way
 * to reach the page except through these operations.
 */
export interface ApplyPageSession extends ApplyRawPageHands {
  /**
   * Installs the guard that stops a prepare-only run from transmitting
   * anything. Called once, before the first read.
   */
  installPrepareOnlyGuard: (input: {
    intermediateMutationsAuthorized: boolean;
    allowedOrigins: readonly string[];
  }) => Promise<void>;
  /** The most recent attempt the guard stopped, or null. */
  readBlockedAttempt: () => Promise<ApplyBlockedAttempt | null>;
  /**
   * Tells the guard that this exact value is now in a form field, so it can
   * tell a request that carries it from one that does not.
   */
  registerPreparedValue: (value: string) => Promise<void>;
  /**
   * Opens the short, same-origin window in which the site may save the field
   * that was just filled, when the person authorized that. Throws when the
   * current origin is outside that authority.
   */
  openIntermediateWriteWindow: () => Promise<void>;
  closeIntermediateWriteWindow: () => Promise<void>;
  /** How many intermediate writes the guard has let through so far. */
  readIntermediateWriteCount: () => number;
  /**
   * Rechecks whether a service worker can influence this origin. Called
   * before any click that advances the form.
   */
  checkServiceWorker: () => Promise<ApplyServiceWorkerFinding | null>;
}
