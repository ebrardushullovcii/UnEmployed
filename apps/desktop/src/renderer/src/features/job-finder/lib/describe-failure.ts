/**
 * One error voice for Job Finder.
 *
 * Round-nine review (RC-02) found ~40 render sites printing a thrown
 * `Error.message` verbatim as the app's error copy. What reached people that
 * way included `Apply run '<uuid>' is already executing.`, `Unable to find
 * bullet '<id>'.`, "Both resume import extraction branches failed." on the
 * first screen a new user sees, the literal string `Error invoking remote
 * method 'job-finder:…'`, and — through the provider transport — a model
 * vendor's own error text, provider name and key hints.
 *
 * The rule this module exists to enforce: **the renderer never renders a
 * thrown message.** A failure is classified into one of a small, closed set of
 * plain sentences ({@link FAILURE_SENTENCES}); the raw text goes only into a
 * Technical details disclosure, if anywhere.
 *
 * The set is closed on purpose. A new failure family is a decision about what
 * to tell a person and what they can do about it — it is added here, once,
 * with its sentence, rather than invented at a call site by forwarding
 * whatever a package happened to throw.
 */

/**
 * The failure families Job Finder distinguishes. Anything unrecognised is
 * `unknown` and gets the caller's own sentence, never the thrown text.
 */
export type FailureKind =
  | "offline"
  | "timed_out"
  | "busy"
  | "changed_elsewhere"
  | "not_found"
  | "site_blocked"
  | "assistant_unavailable"
  | "unknown";

/**
 * The closed set. Each sentence says what happened and what the person can do
 * next. No jargon, no "failed to", no stored identifier, no error code.
 *
 * `unknown` is the only entry a caller may override, by passing its own
 * action-specific sentence to {@link describeFailure}.
 */
export const FAILURE_SENTENCES = {
  offline:
    "Job Finder could not reach the internet. Check your connection and try again.",
  timed_out: "This took too long and stopped on its own. Try it again.",
  busy: "Something else is already doing this. Wait for it to finish, then try again.",
  changed_elsewhere:
    "This changed somewhere else while you were working on it. Reload it and make your change again.",
  not_found: "This is no longer here. Go back and choose it again.",
  site_blocked:
    "The job site would not let Job Finder continue. Finish this step yourself in the browser.",
  assistant_unavailable:
    "The writing assistant did not answer. Try again in a few minutes.",
  unknown: "Something went wrong and this did not finish. Try again.",
} as const satisfies Record<FailureKind, string>;

/**
 * One name for the place raw failure text is allowed to appear. Anything
 * technical lives behind a disclosure carrying exactly this label, so a person
 * always meets the plain sentence first.
 */
export const TECHNICAL_DETAILS_LABEL = "Technical details";

export type FailureDescription = {
  /** The recognised family, for tone and for choosing a recovery control. */
  kind: FailureKind;
  /**
   * What Job Finder was doing, as a sentence: `Could not save your profile.`
   * Null when the caller named no action.
   */
  headline: string | null;
  /** One member of {@link FAILURE_SENTENCES}, or the caller's own sentence. */
  sentence: string;
  /**
   * The complete user-visible copy: headline then sentence. Deliberately not
   * called `message`, so it can never be mistaken for `Error.message` by a
   * reader or by the guard in `user-copy.test.ts`.
   */
  userMessage: string;
  /**
   * The raw text, for a {@link TECHNICAL_DETAILS_LABEL} disclosure only. Null
   * when there was nothing readable to show. Never render this as the failure
   * copy itself.
   */
  technicalDetails: string | null;
};

export type DescribeFailureOptions = {
  /**
   * What the person was doing, as a bare verb phrase in second person:
   * `"save your profile"`, `"open the application"`. Used as
   * `Could not <action>.`
   */
  action?: string | null;
  /**
   * The sentence to use when the failure is not one of the recognised
   * families. Lets a screen say something more specific than the generic
   * `unknown` sentence — but it is still copy the app wrote, not thrown text.
   */
  unknownSentence?: string | null;
};

const REMOTE_METHOD_ERROR_RE =
  /^Error invoking remote method '[^']+': (?:(?:[A-Za-z]*Error): )?(.*)$/s;

/**
 * The raw failure text with Electron's `Error invoking remote method '…':`
 * transport wrapper removed, or null when there was nothing readable.
 *
 * This is **technical detail, not copy**. It belongs behind a
 * {@link TECHNICAL_DETAILS_LABEL} disclosure, or as input to another
 * classifier. Rendering it as the failure sentence is the RC-02 defect.
 */
export function getJobFinderErrorDetail(error: unknown): string | null {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : typeof error === "object" && error !== null
          ? (error as { message?: unknown }).message
          : null;

  if (typeof message !== "string") {
    return null;
  }

  const remoteMethodMatch = REMOTE_METHOD_ERROR_RE.exec(message);
  return remoteMethodMatch?.[1]?.trim() || message.trim() || null;
}

const OFFLINE_PATTERNS = [
  /\bfetch failed\b/i,
  /\boffline\b/i,
  /\bENOTFOUND\b/,
  /\bECONNREFUSED\b/,
  /\bECONNRESET\b/,
  /\bEAI_AGAIN\b/,
  /\bnetwork (?:error|request failed)\b/i,
  /\bfailed to fetch\b/i,
];

const TIMEOUT_PATTERNS = [
  /\btimed? ?out\b/i,
  /\btimeout\b/i,
  /\bETIMEDOUT\b/,
  /\bdeadline exceeded\b/i,
];

const BUSY_PATTERNS = [
  /\balready (?:executing|running|in progress)\b/i,
  /\bSQLITE_BUSY\b/,
  /\bis locked\b/i,
  /\banother .* is (?:already )?running\b/i,
];

const CHANGED_ELSEWHERE_PATTERNS = [
  /\bchanged (?:elsewhere|after it was saved|since)\b/i,
  /\bstale\b/i,
  /\brevision (?:mismatch|conflict)\b/i,
  /\bconcurrent (?:modification|update)\b/i,
  /\bout of date\b/i,
];

const NOT_FOUND_PATTERNS = [
  /\bunknown Job Finder\b/i,
  /\bnot found\b/i,
  /\bno longer exists\b/i,
  /\bunable to find\b/i,
  /\bmissing (?:job|record|draft|document)\b/i,
];

const SITE_BLOCKED_PATTERNS = [
  /\bsite login required\b/i,
  /\bblocked by the site\b/i,
  /\bservice worker\b/i,
  /\bnavigation was blocked\b/i,
  /\bCAPTCHA\b/i,
];

const ASSISTANT_UNAVAILABLE_PATTERNS = [
  /\bmodel returned\b/i,
  /\bprovider\b.*\b(?:unavailable|error|refused)\b/i,
  /\bno usable candidates\b/i,
  /\bextraction branches failed\b/i,
  /\brate limit\b/i,
  /\b(?:401|403|429|5\d\d)\b.*\bstatus\b/i,
];

const KIND_PATTERNS: readonly (readonly [
  Exclude<FailureKind, "unknown">,
  readonly RegExp[],
])[] = [
  // Ordered most specific first: "already executing" is busy even though the
  // same string may also contain a job id that looks like a missing record.
  ["busy", BUSY_PATTERNS],
  ["changed_elsewhere", CHANGED_ELSEWHERE_PATTERNS],
  ["site_blocked", SITE_BLOCKED_PATTERNS],
  ["timed_out", TIMEOUT_PATTERNS],
  ["offline", OFFLINE_PATTERNS],
  ["not_found", NOT_FOUND_PATTERNS],
  ["assistant_unavailable", ASSISTANT_UNAVAILABLE_PATTERNS],
];

/**
 * Classify a thrown value into one of {@link FAILURE_SENTENCES}. Exported so a
 * screen can pick a recovery control from the family without re-deriving it
 * from the sentence text.
 */
export function classifyFailure(error: unknown): FailureKind {
  const detail = getJobFinderErrorDetail(error);

  if (detail === null) {
    return "unknown";
  }

  for (const [kind, patterns] of KIND_PATTERNS) {
    if (patterns.some((pattern) => pattern.test(detail))) {
      return kind;
    }
  }

  return "unknown";
}

/**
 * The one way a Job Finder screen turns a thrown value into copy.
 *
 * Returns a plain sentence from the closed set and keeps the raw text in
 * {@link FailureDescription.technicalDetails}, for a
 * {@link TECHNICAL_DETAILS_LABEL} disclosure. It never returns thrown text as
 * the visible sentence, whatever the thrown value contained.
 */
export function describeFailure(
  error: unknown,
  options: DescribeFailureOptions = {},
): FailureDescription {
  const kind = classifyFailure(error);
  const action = options.action?.trim();
  const headline = action ? `Could not ${action}.` : null;
  const sentence =
    kind === "unknown"
      ? (options.unknownSentence?.trim() ?? "") || FAILURE_SENTENCES.unknown
      : FAILURE_SENTENCES[kind];

  return {
    kind,
    headline,
    sentence,
    userMessage: headline ? `${headline} ${sentence}` : sentence,
    technicalDetails: getJobFinderErrorDetail(error),
  };
}
