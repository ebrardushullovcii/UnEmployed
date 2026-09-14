import { normalizeSignal } from "./control-classification";
import { looksLikeSignInPage, siteLoginRequiredBlocker } from "./blockers";
import type {
  ApplyBlocker,
  ApplyFormObservation,
  ApplyPageHands,
} from "./types";

/**
 * Finding the way from a job listing to the application form.
 *
 * A listing page and the form that takes the application are usually two
 * different pages, often on two different sites: the board shows the job, an
 * "Apply" control leads to the employer, and the employer's careers page leads
 * to the form. A run that lands on the listing and reports that there is
 * nothing to fill in has not looked; it has only read the first page.
 *
 * Everything here reads words, roles and page structure — what the control
 * says about itself and where it sits (ADR 0007). There is no site in this
 * file, and following a link is a read: it asks the site for a page it already
 * publishes and writes nothing.
 */

/** Text that reads as the control which starts an application. */
const APPLY_ENTRY_PHRASES: readonly string[] = [
  "apply",
  "apply now",
  "apply here",
  "apply today",
  "apply for this job",
  "apply for this role",
  "apply for this position",
  "apply to this job",
  "easy apply",
  "quick apply",
  "one click apply",
  "apply on company site",
  "apply on company website",
  "apply on employer site",
  "apply externally",
  "apply with your resume",
  "apply for job",
  "start your application",
  "start application",
  "begin application",
  "i m interested",
  "im interested",
  "i am interested",
  "view job and apply",
  "see job and apply",
];

/** Text that mentions applying without being the control that starts one. */
const NOT_AN_ENTRY_PHRASES: readonly string[] = [
  "apply filter",
  "apply filters",
  "apply changes",
  "applied",
  "how to apply",
  "jobs you applied",
  "why apply",
  "apply for other",
  "apply to other",
  "similar jobs",
  "back to",
  "apply for a different",
];

/** Text that offers an account rather than an application. */
const SIGN_IN_PHRASES: readonly string[] = [
  "sign in",
  "log in",
  "login",
  "register",
  "create an account",
  "create account",
  "sign up",
  "continue with",
];

/** The question kinds that only an application form asks. */
const APPLICATION_QUESTION_KINDS: ReadonlySet<string> = new Set([
  "personal_info",
  "resume",
  "cover_letter",
  "work_authorization",
  "visa_sponsorship",
  "salary_expectation",
  "notice_period",
  "availability",
  "relocation",
  "travel",
  "clearance",
  "portfolio",
  "experience",
]);

export interface ApplyEntryCandidate {
  /** Whether this is a link that navigates or a control on the page. */
  kind: "link" | "action";
  ref: string;
  label: string;
  href: string | null;
  /** The site the link leads to, when it leads to a web page. */
  host: string | null;
  opensNewWindow: boolean;
}

export type ApplyEntryFinding =
  /** There is a form on this page already; nothing to follow. */
  | { kind: "form_present" }
  /** The way in, and Job Finder can take it. */
  | { kind: "follow"; entry: ApplyEntryCandidate }
  /** The way in leaves this browser: a new window, an email, a document. */
  | {
      kind: "hand_off";
      entry: ApplyEntryCandidate;
      reason: "new_window" | "email" | "document";
    }
  /**
   * This page, or the only way off it, asks for an account first. The entry is
   * null when the page itself is the sign-in.
   */
  | { kind: "sign_in"; entry: ApplyEntryCandidate | null }
  /** Nothing on this page starts an application. */
  | { kind: "none" };

function matchesPhrase(signal: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => signal.includes(phrase));
}

/**
 * Whether a piece of accessible text reads as the control that starts an
 * application. Exported because the listing reader asks the same question of
 * page HTML before a run ever starts.
 */
export function looksLikeApplyEntryText(text: string): boolean {
  const signal = normalizeSignal(text);
  if (!signal || signal.length > 60) {
    return false;
  }
  if (matchesPhrase(signal, NOT_AN_ENTRY_PHRASES)) {
    return false;
  }
  return matchesPhrase(signal, APPLY_ENTRY_PHRASES);
}

function looksLikeSignIn(text: string): boolean {
  return matchesPhrase(normalizeSignal(text), SIGN_IN_PHRASES);
}

/** How strongly this text reads as the main way in, highest first. */
function entryTextScore(text: string): number {
  const signal = normalizeSignal(text);
  if (APPLY_ENTRY_PHRASES.includes(signal)) {
    return 3;
  }
  if (signal.startsWith("apply")) {
    return 2;
  }
  return 1;
}

/** The fields a board's own page carries that have nothing to do with applying. */
const SITE_FURNITURE_PATTERN =
  /\b(?:search|filter|sort|keyword|newsletter|subscribe|job alert|alerts)\b/u;

/**
 * Whether this page already asks something the person could answer.
 *
 * A site search box and a newsletter field are fillable and mean nothing, so
 * they do not count. Anything else does: one real field is enough to stay.
 * Walking away from a page that already has a form is far worse than staying
 * on a listing a moment longer — it is how a run leaves the form it was sent
 * to and spends its time following Apply links away from it.
 */
export function hasApplicationFormControls(
  observation: ApplyFormObservation,
): boolean {
  return observation.controls.some(
    (control) =>
      control.visible &&
      !control.disabled &&
      !control.readOnly &&
      (control.kind === "file" ||
        APPLICATION_QUESTION_KINDS.has(control.questionKind) ||
        control.attestationKind !== null ||
        !SITE_FURNITURE_PATTERN.test(
          normalizeSignal(
            `${control.label} ${control.groupLabel} ${control.placeholder}`,
          ),
        )),
  );
}

function toLinkCandidate(
  link: ApplyFormObservation["links"][number],
): ApplyEntryCandidate {
  return {
    kind: "link",
    ref: link.ref,
    label: link.label,
    href: link.href,
    host: link.origin ? new URL(link.origin).hostname.replace(/^www\./iu, "") : null,
    opensNewWindow: link.opensNewWindow,
  };
}

/**
 * The best apply control on this page, or why there is not one.
 *
 * Ranked by how plainly the text says "apply", then by whether it is visible,
 * then by how near the top of the page it sits — a primary control beside the
 * job title outranks a repeat of it in the footer.
 */
export function findApplyEntry(
  observation: ApplyFormObservation,
): ApplyEntryFinding {
  // A sign-in page has fields and a button like any form. It is checked first,
  // every time, because calling it an application form is how a run ends up
  // typing into a login box and then reporting that it got stuck.
  if (
    looksLikeSignInPage({
      url: observation.url,
      bodyText: observation.bodyTextExcerpt,
      controls: observation.controls,
      actions: observation.actions,
    })
  ) {
    return { kind: "sign_in", entry: null };
  }
  if (hasApplicationFormControls(observation)) {
    return { kind: "form_present" };
  }

  const linkCandidates = observation.links
    .filter((link) => looksLikeApplyEntryText(link.label))
    .map((link) => ({
      candidate: toLinkCandidate(link),
      destination: link.destination,
      score: entryTextScore(link.label),
      visible: link.visible,
      topOffset: link.topOffset,
    }));

  const actionCandidates = observation.actions
    .filter(
      (action) => !action.disabled && looksLikeApplyEntryText(action.label),
    )
    .map((action) => ({
      candidate: {
        kind: "action" as const,
        ref: action.ref,
        label: action.label,
        href: null,
        host: null,
        opensNewWindow: false,
      },
      destination: "page" as const,
      score: entryTextScore(action.label),
      visible: action.visible,
      topOffset: Number.MAX_SAFE_INTEGER,
    }));

  const ranked = [...linkCandidates, ...actionCandidates].sort(
    (left, right) =>
      Number(right.visible) - Number(left.visible) ||
      right.score - left.score ||
      left.topOffset - right.topOffset,
  );

  const best = ranked[0];
  if (!best) {
    // A sign-in link that offers to take the application is still the only way
    // in, and it is the person's to take.
    const signIn = observation.links.find(
      (link) =>
        link.visible &&
        looksLikeSignIn(link.label) &&
        normalizeSignal(link.label).includes("apply"),
    );
    return signIn
      ? { kind: "sign_in", entry: toLinkCandidate(signIn) }
      : { kind: "none" };
  }

  if (looksLikeSignIn(best.candidate.label)) {
    return { kind: "sign_in", entry: best.candidate };
  }
  if (best.destination === "email") {
    return { kind: "hand_off", entry: best.candidate, reason: "email" };
  }
  if (best.destination === "document" || best.destination === "other") {
    return { kind: "hand_off", entry: best.candidate, reason: "document" };
  }
  if (best.candidate.opensNewWindow) {
    return { kind: "hand_off", entry: best.candidate, reason: "new_window" };
  }
  return { kind: "follow", entry: best.candidate };
}

export type ApplyEntryOutcome =
  /** The run is standing on a form with something to fill in. */
  | "form_reached"
  /** The application is somewhere this run cannot follow it to. */
  | "handed_off"
  /** The page it reached needs the person before anything can be filled in. */
  | "blocked"
  /** Nothing on the page starts an application. */
  | "not_found"
  /** There was a way in and it did not open. */
  | "unreachable";

export interface ApplyEntryResolution {
  outcome: ApplyEntryOutcome;
  /** The page as it is now, whether or not the way in was found. */
  observation: ApplyFormObservation;
  /** One plain sentence per hop, for the run's trail. */
  notes: string[];
  /** Why the run stopped, in one sentence. Null when a form was reached. */
  reason: string | null;
  /** What to tell the person to do, when this needs them. */
  blocker: ApplyBlocker | null;
  hops: number;
}

const DEFAULT_MAX_HOPS = 2;
const DEFAULT_TIME_BUDGET_MS = 30_000;

function handOffSentence(
  entry: ApplyEntryCandidate,
  reason: "new_window" | "email" | "document",
): string {
  const where = entry.host ?? "the employer";
  switch (reason) {
    case "email":
      return `This listing takes applications by email rather than a form; open it in the Job Finder browser to send it yourself.`;
    case "document":
      return `This listing sends you to a file on ${where} to apply; open it in the Job Finder browser.`;
    default:
      return `This listing sends you to ${where} to apply, in a window of its own; open it in the Job Finder browser.`;
  }
}

/**
 * Walks from wherever the run landed to the page that takes the application.
 *
 * Bounded on both axes: a few hops and under a minute. Every hop is written
 * down, so the person can see the route that was taken and where it stopped.
 */
export async function resolveApplyEntry(input: {
  hands: ApplyPageHands;
  observation: ApplyFormObservation;
  maxHops?: number;
  timeBudgetMs?: number;
  now?: () => Date;
}): Promise<ApplyEntryResolution> {
  const now = input.now ?? (() => new Date());
  const startedAtMs = now().getTime();
  const maxHops = Math.max(1, input.maxHops ?? DEFAULT_MAX_HOPS);
  const timeBudgetMs = Math.max(1, input.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);

  const notes: string[] = [];
  const visited = new Set<string>(
    input.observation.url ? [input.observation.url] : [],
  );
  let observation = input.observation;
  let hops = 0;

  const done = (
    outcome: ApplyEntryOutcome,
    reason: string | null,
    blocker: ApplyBlocker | null = null,
  ): ApplyEntryResolution => ({
    outcome,
    observation,
    notes,
    reason,
    blocker,
    hops,
  });

  for (;;) {
    const finding = findApplyEntry(observation);
    if (finding.kind === "form_present") {
      return done("form_reached", null);
    }
    if (finding.kind === "sign_in") {
      const blocker = siteLoginRequiredBlocker();
      notes.push(
        finding.entry
          ? `The only way to apply from this page is "${finding.entry.label}", which asks you to sign in first.`
          : "This page asks you to sign in before it will take an application.",
      );
      return done("blocked", blocker.summary, blocker);
    }
    if (finding.kind === "hand_off") {
      const reason = handOffSentence(finding.entry, finding.reason);
      notes.push(reason);
      return done("handed_off", reason, {
        code: "application_page_unreachable",
        summary: reason,
        detail: `Job Finder found "${finding.entry.label}" on the listing but it leads somewhere this run cannot follow it to.`,
        nextActionLabel: "Open it in the Job Finder browser",
      });
    }
    if (finding.kind === "none") {
      const reason =
        "This listing has no apply link; the job may be closed or the employer takes applications elsewhere.";
      notes.push(reason);
      return done("not_found", reason, {
        code: "application_page_unreachable",
        summary: reason,
        detail:
          "Job Finder opened the page and found neither an application form nor a control that starts one.",
        nextActionLabel: "Open the listing in the Job Finder browser",
      });
    }

    if (hops >= maxHops || now().getTime() - startedAtMs >= timeBudgetMs) {
      const reason =
        "Job Finder followed the apply links from this listing but never reached an application form; open it in the Job Finder browser.";
      notes.push(reason);
      return done("not_found", reason, {
        code: "application_page_unreachable",
        summary: reason,
        detail:
          "Each page it opened led on to another one rather than to a form it could fill in.",
        nextActionLabel: "Open the listing in the Job Finder browser",
      });
    }

    const entry = finding.entry;
    const result =
      entry.kind === "link"
        ? await input.hands.followLink(entry.ref)
        : await input.hands.clickAction(entry.ref);
    hops += 1;
    if (!result.ok) {
      const reason = `Job Finder could not open "${entry.label}" from this listing; open it in the Job Finder browser.`;
      notes.push(reason);
      return done("unreachable", reason, {
        code: "application_page_unreachable",
        summary: reason,
        detail: result.error,
        nextActionLabel: "Open the listing in the Job Finder browser",
      });
    }

    observation = await input.hands.observe();
    notes.push(
      `Followed "${entry.label}" to ${observation.origin ? new URL(observation.origin).hostname.replace(/^www\./iu, "") : "the next page"}.`,
    );

    if (observation.blocker) {
      return done(
        "blocked",
        observation.blocker.summary,
        observation.blocker,
      );
    }

    const landedOn = observation.url;
    if (landedOn && visited.has(landedOn)) {
      const reason =
        "The apply link on this listing leads back to the listing itself; open it in the Job Finder browser.";
      notes.push(reason);
      return done("not_found", reason, {
        code: "application_page_unreachable",
        summary: reason,
        detail: "Following it did not reach a different page.",
        nextActionLabel: "Open the listing in the Job Finder browser",
      });
    }
    if (landedOn) {
      visited.add(landedOn);
    }
  }
}
