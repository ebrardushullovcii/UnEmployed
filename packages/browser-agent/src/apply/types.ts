import type {
  ApplicationAttemptQuestion,
  ApplyBlockedAttempt,
  CoverLetterPreference,
  ApplyNavigationResult,
  ApplyServiceWorkerFinding,
  ApplyWriteResult,
  ApplicationAttestationKind,
  ApplicationAutomationMode,
  ApplicationQuestionControlType,
  ApplicationQuestionKind,
  ApplicationSalaryDisclosureRule,
  CandidateProfile,
  CandidateReusableAnswer,
} from "@unemployed/contracts";

/**
 * Shapes for the agent that fills in an employer's application form.
 *
 * The agent never touches a page directly. It proposes one bounded action at a
 * time; a deterministic executor binds that proposal to the page as it is right
 * now, to the saved authority document, and to the answers Job Finder can
 * actually prove before anything is written. See ADR 0012 and ADR 0021.
 */

/** What a form control is, in terms the rest of the loop reasons about. */
export type ApplyControlKind =
  | "text"
  | "long_text"
  | "select"
  | "combobox"
  | "checkbox"
  | "radio"
  | "file"
  | "date"
  | "other";

/** What a button on the form does. */
export type ApplyActionKind = "advance" | "back" | "final" | "other";

export interface ApplyFormControl {
  /** Stable handle for this control within one observation. */
  ref: string;
  kind: ApplyControlKind;
  label: string;
  groupLabel: string;
  placeholder: string;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  visible: boolean;
  value: string;
  checked: boolean;
  options: string[];
  selectedOptionLabel: string;
  invalid: boolean;
  validationMessage: string;
  /** What the question is about, so an answer can be sourced for it. */
  questionKind: ApplicationQuestionKind;
  answerControlType: ApplicationQuestionControlType;
  /** Set when the control asks the person to declare something themselves. */
  attestationKind: ApplicationAttestationKind | null;
  /**
   * The calling code a picker beside this field is already showing, when there
   * is one, so a phone number is not written out with the code twice.
   */
  selectedCallingCode?: string | null;
  /** True when the control already carries an answer. */
  answered: boolean;
}

export interface ApplyFormAction {
  ref: string;
  label: string;
  kind: ApplyActionKind;
  visible: boolean;
  disabled: boolean;
}

/** What a link on the page opens, read from the address itself. */
export type ApplyLinkDestination = "page" | "email" | "document" | "other";

/**
 * A link on the page the run landed on.
 *
 * A listing and the form it leads to are usually two pages. These are how the
 * run finds the way through; nothing here is specific to any site.
 */
export interface ApplyPageLink {
  /** Stable handle for this link within one observation. */
  ref: string;
  label: string;
  href: string;
  origin: string | null;
  destination: ApplyLinkDestination;
  /** True when the link opens a window of its own rather than this one. */
  opensNewWindow: boolean;
  visible: boolean;
  /** Distance from the top of the page, used only to rank candidates. */
  topOffset: number;
}

/** Where the person is in a form that runs over several screens. */
export interface ApplyStepPosition {
  label: string | null;
  index: number | null;
  total: number | null;
}

export type ApplyBlockerCode =
  | "site_login_required"
  | "account_creation_required"
  | "security_challenge"
  | "multi_factor_required"
  | "application_closed"
  | "application_page_unreachable"
  /** The form saves each answer to the site as it is typed. */
  | "site_saves_as_you_go";

export interface ApplyBlocker {
  code: ApplyBlockerCode;
  /** One plain sentence about what the page is showing. */
  summary: string;
  detail: string;
  nextActionLabel: string;
  /**
   * The site the page was trying to reach, when the next action is about one.
   * It is what a one-click "allow saving on this site" would be granted for.
   */
  host?: string | null;
}

export interface ApplyFormObservation {
  observedAt: string;
  /** Changes whenever the page changes; a proposal made against an older one is refused. */
  signature: string;
  url: string | null;
  origin: string | null;
  title: string | null;
  step: ApplyStepPosition;
  /** A bounded excerpt of what the page says, for confirmation and blocker copy. */
  bodyTextExcerpt: string;
  controls: ApplyFormControl[];
  actions: ApplyFormAction[];
  links: ApplyPageLink[];
  validationErrors: string[];
  blocker: ApplyBlocker | null;
}

/** A file Job Finder already holds for this application. */
export interface ApplyDocument {
  id: string;
  fileName: string;
  mimeType: string;
  /** What the file is, in the person's words ("Your CV", "Cover letter"). */
  label: string;
  kind: "resume" | "cover_letter" | "other";
  loadBytes: () => Promise<Uint8Array>;
}

/**
 * The only way the loop reaches a page.
 *
 * Everything here is a browser mechanic. Nothing here decides what to write or
 * whether writing is allowed; that is the executor's job.
 */
export interface ApplyPageHands {
  observe: () => Promise<ApplyFormObservation>;
  fillText: (ref: string, value: string) => Promise<ApplyWriteResult>;
  chooseOption: (ref: string, optionLabel: string) => Promise<ApplyWriteResult>;
  setToggle: (ref: string, checked: boolean) => Promise<ApplyWriteResult>;
  uploadFile: (
    ref: string,
    file: { name: string; mimeType: string; bytes: Uint8Array },
  ) => Promise<ApplyWriteResult>;
  clickAction: (ref: string) => Promise<ApplyWriteResult>;
  /** Opens what a link points at, in the same page. A read, never a write. */
  followLink: (ref: string) => Promise<ApplyNavigationResult>;
}

/** Where an answer came from. Every written answer carries one. */
export type ApplyAnswerSourceKind =
  | "profile"
  | "resume"
  | "answer_library"
  | "generated"
  | "document";

export interface ApplyAnswer {
  value: string;
  kind: ApplicationQuestionKind;
  sourceKind: ApplyAnswerSourceKind;
  sourceId: string;
  /** One short phrase shown to the person: "from your profile". */
  provenanceLabel: string;
  /** What a written answer was built from. Always filled for generated text. */
  groundedIn: string[];
}

export interface ApplyAnswerSources {
  profile: CandidateProfile;
  /** Plain text of the resume that goes with this application, when there is one. */
  resumeText: string | null;
  posting: {
    title: string;
    company: string;
    location: string;
    description: string;
  };
  reusableAnswers: readonly CandidateReusableAnswer[];
  documents: readonly ApplyDocument[];
}

/**
 * The saved permissions this run works inside.
 *
 * Job Finder derives every field before the run starts. Nothing the model says
 * can widen it.
 */
export interface ApplyAuthority {
  mode: ApplicationAutomationMode;
  /** Only ever true when the saved document covers this exact application. */
  submitAuthorized: boolean;
  preApprovedAttestationKinds: readonly ApplicationAttestationKind[];
  salaryDisclosure: ApplicationSalaryDisclosureRule;
  /** Exact origins the saved document covers. Empty means "only where we started". */
  allowedOrigins: readonly string[];
}

/**
 * The safety mechanics that belong to the open page.
 *
 * Supplied by whoever owns the browser. Omitting them is only ever right in a
 * test: a real run installs the guard before it reads anything.
 */
export interface ApplySafetyHooks {
  /** The most recent thing the prepare-only guard stopped, or null. */
  readBlockedAttempt: () => Promise<ApplyBlockedAttempt | null>;
  /** Tells the guard an exact value is now in a field. */
  registerPreparedValue: (value: string) => Promise<void>;
  /** Opens the short window in which the site may save the field just filled. */
  openIntermediateWriteWindow: () => Promise<void>;
  closeIntermediateWriteWindow: () => Promise<void>;
  /** Rechecks for a background worker that could change the page. */
  checkServiceWorker: () => Promise<ApplyServiceWorkerFinding | null>;
}

/**
 * The one letter this application sends.
 *
 * Whoever owns documents provides it: generated once, rendered when a form
 * wants a file, and the same words when a form wants it typed into a box.
 */
export interface ApplyLetterProvider {
  preference: CoverLetterPreference;
  provide: (request: {
    prompt: string;
    groundedIn: string[];
    language: string | null;
    delivery: "file" | "text";
    /** A file type the form insists on, when it named one. */
    fileType: "pdf" | "docx" | null;
  }) => Promise<
    | { ok: true; text: string; document: ApplyDocument | null }
    | { ok: false; reason: string }
  >;
}

export type ApplyPauseCode =
  | "question_needs_you"
  | "declaration_needs_you"
  | "document_needs_you"
  | "page_blocked"
  | "site_tried_to_send";

export interface ApplyPause {
  code: ApplyPauseCode;
  /** One plain sentence for the Needs you list. */
  summary: string;
  /**
   * The first question this pause is about, kept so everything that read one
   * question still works.
   */
  question: ApplicationAttemptQuestion | null;
  /**
   * Every question the run could not answer, in the order they appear on the
   * page. A form is worked to the end before it stops, so the person answers
   * once rather than once per field.
   */
  questions?: ApplicationAttemptQuestion[];
  blocker: ApplyBlocker | null;
}

export interface ApplyFilledControl {
  ref: string;
  label: string;
  questionKind: ApplicationQuestionKind;
  answer: ApplyAnswer;
  at: string;
}

export interface ApplyAttachedDocument {
  documentId: string;
  fileName: string;
  label: string;
  controlLabel: string;
  at: string;
}

export type ApplyAgentOutcome =
  | "prepared"
  /** Complete, with the send button identified. Nobody has pressed it. */
  | "ready_to_send"
  | "awaiting_your_review"
  | "paused"
  | "stuck";

export interface ApplyAgentResult {
  outcome: ApplyAgentOutcome;
  /** One plain sentence about how the run ended. Shown to the person as-is. */
  reason: string;
  steps: number;
  finalUrl: string | null;
  filled: ApplyFilledControl[];
  attachments: ApplyAttachedDocument[];
  pauses: ApplyPause[];
  /** Plain-sentence trail of what happened, oldest first. */
  notes: string[];
  /**
   * The button that sends this application, once the form is complete and the
   * checks passed. Null whenever the application is not ready to go.
   */
  readyToSend: { actionRef: string; actionLabel: string } | null;
}

/** One bounded thing the model asked to do. */
export type ApplyProposal =
  | { tool: "inspect_form" }
  | { tool: "read_blockers" }
  | { tool: "answer_control"; ref: string; freeTextAnswer?: string; groundedIn?: string[] }
  | { tool: "attach_document"; ref: string; documentId: string }
  | { tool: "go_to_step"; ref: string }
  | { tool: "submit_application"; ref: string }
  | { tool: "finish"; reason: string; stuck?: boolean };

export interface ApplyAgentConfig {
  hands: ApplyPageHands;
  /** The guard and worker checks for this page. Absent only in tests. */
  safety?: ApplySafetyHooks;
  /** Writes and renders the letter this application sends, when it needs one. */
  letters?: ApplyLetterProvider;
  /**
   * Whether the person authorized the site to save fields as they are filled.
   * When false, nothing is transmitted at all.
   */
  intermediateWritesAuthorized?: boolean;
  authority: ApplyAuthority;
  sources: ApplyAnswerSources;
  /** Identity of the application record every write is bound to. */
  application: { jobId: string; applicationId: string; startingUrl: string };
  /** Site name in the person's words, used in the copy: "Greenhouse", "the careers site". */
  siteLabel: string;
  /** Safety ceilings only. The agent decides when it is done. */
  runControl?: {
    maxSteps?: number;
    timeBudgetMs?: number;
    noProgressStepLimit?: number;
    /** How many pages the run may follow to reach the form. */
    applyEntryMaxHops?: number;
    /** How long the walk from a listing to the form may take. */
    applyEntryTimeBudgetMs?: number;
  };
  now?: () => Date;
  signal?: AbortSignal;
}
