import { normalizeSignal } from "./control-classification";
import type { ApplyBlocker, ApplyFormAction, ApplyFormControl } from "./types";

/**
 * Things on a page that stop an application and need the person.
 *
 * Every one of these is user-owned by decision, not by limitation: signing in,
 * creating an account, a security check, and a second factor stay with the
 * person (ADR 0012). The copy says what the page is showing and what to do,
 * never why the automation failed.
 */

const SIGN_IN_SIGNALS = [
  "sign in to continue",
  "log in to continue",
  "please sign in",
  "please log in",
  "you must be signed in",
  "you must be logged in",
  "sign in to apply",
  "log in to apply",
];

const ACCOUNT_SIGNALS = [
  "create an account",
  "create your account",
  "register to apply",
  "sign up to apply",
  "create a candidate account",
  "create profile to continue",
];

const CHALLENGE_SIGNALS = [
  "verify you are human",
  "verify you are a human",
  "i am not a robot",
  "security check",
  "unusual traffic",
  "complete the challenge",
  "prove you are not a robot",
];

const SECOND_FACTOR_SIGNALS = [
  "verification code",
  "two factor",
  "two step verification",
  "one time code",
  "authentication code",
  "enter the code we sent",
];

const CLOSED_SIGNALS = [
  "no longer accepting applications",
  "this job is closed",
  "position has been filled",
  "posting is closed",
  "applications are closed",
  "this posting is no longer available",
];

function hasPasswordControl(controls: readonly ApplyFormControl[]): boolean {
  return controls.some(
    (control) =>
      control.visible &&
      /\bpassword\b/u.test(normalizeSignal(`${control.label} ${control.placeholder}`)),
  );
}

function hasSignInAction(actions: readonly ApplyFormAction[]): boolean {
  return actions.some((action) => {
    const signal = normalizeSignal(action.label);
    return action.visible && (signal === "sign in" || signal === "log in" || signal === "login");
  });
}

function contains(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

export function detectApplyBlocker(input: {
  bodyText: string;
  controls: readonly ApplyFormControl[];
  actions: readonly ApplyFormAction[];
}): ApplyBlocker | null {
  const text = normalizeSignal(input.bodyText);

  if (contains(text, CHALLENGE_SIGNALS)) {
    return {
      code: "security_challenge",
      summary: "The site is running a security check.",
      detail:
        "The page asked to confirm a person is here. Job Finder never answers those, so it stopped and left the page as it found it.",
      nextActionLabel: "Open the page and finish it yourself",
    };
  }

  if (contains(text, SECOND_FACTOR_SIGNALS)) {
    return {
      code: "multi_factor_required",
      summary: "The site asked for a code sent to you.",
      detail:
        "Only you have that code, so Job Finder stopped here without entering anything.",
      nextActionLabel: "Open the page and enter your code",
    };
  }

  if (contains(text, ACCOUNT_SIGNALS)) {
    return {
      code: "account_creation_required",
      summary: "The site wants an account before you can apply.",
      detail:
        "Job Finder never creates accounts for you. Make the account once and it can carry on from there.",
      nextActionLabel: "Create the account yourself",
    };
  }

  if (
    contains(text, SIGN_IN_SIGNALS) ||
    (hasPasswordControl(input.controls) && hasSignInAction(input.actions))
  ) {
    return {
      code: "site_login_required",
      summary: "The site wants you signed in first.",
      detail:
        "Your sign-in stays yours. Sign in on this site and Job Finder can pick the application back up.",
      nextActionLabel: "Sign in on the site",
    };
  }

  if (contains(text, CLOSED_SIGNALS)) {
    return {
      code: "application_closed",
      summary: "This job is no longer taking applications.",
      detail: "The page says the posting is closed, so nothing was filled in.",
      nextActionLabel: "Mark this job closed",
    };
  }

  return null;
}

const CONFIRMATION_SIGNALS = [
  "application submitted",
  "thank you for applying",
  "thanks for applying",
  "we have received your application",
  "your application has been received",
  "application received",
  "successfully applied",
  "application complete",
];

/**
 * Whether the page is showing the words a site uses after it takes an
 * application.
 *
 * This is an observation, never proof. A site can show these words and still
 * lose the application, and plenty of sites that did receive one say nothing
 * at all. It exists so a person can be told what was actually on screen after
 * Job Finder pressed send, rather than being left with nothing.
 */
export function hasSubmissionConfirmationText(pageText: string): boolean {
  const haystack = normalizeSignal(pageText);
  return CONFIRMATION_SIGNALS.some((signal) => haystack.includes(signal));
}
