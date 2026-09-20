import type { JobFinderWorkspaceSnapshot } from "@unemployed/contracts";
import type {
  ApplyJobStateKind,
  ApplyMode,
} from "../../lib/apply-mode-contracts-stub";
import {
  JOB_FINDER_BROWSER_NAME,
  OPEN_JOB_FINDER_BROWSER_ACTION,
} from "../../lib/job-finder-browser-handoff-copy";
import {
  applyResultBlockedBySiteSaves,
  applyResultIsStillRunning,
  applyResultHasQuestionForPerson,
  applyResultStoppedStructurally,
  formatElapsedMinutes,
  getApplicationStopReasonSentence,
  looksLikeAccountWall,
  looksLikeSignInWall,
  TRY_AGAIN_ACTION,
} from "./applications-recovery-state";

type ApplyResult =
  | JobFinderWorkspaceSnapshot["applyJobResults"][number]
  | null;

/** The only button an apply state is ever allowed to draw. */
export type ApplyStateAction = "none" | "open_browser" | "try_again";

/**
 * The label for {@link ApplyStateAction} `open_browser`.
 *
 * ADR 0022 writes this parenthetically as "Open the browser"; the window has
 * one enforced name across the product (`job-finder-browser-name.guard`), so
 * the label comes from that one constant rather than adding a second name for
 * the same window.
 */
export const OPEN_THE_BROWSER_ACTION = OPEN_JOB_FINDER_BROWSER_ACTION;

/**
 * One state, one sentence, at most one button (ADR 0022).
 *
 * Applications, Home and the Tasks card all read this, so an application
 * cannot be "Needs follow-up" in one place and "Try again" in another.
 */
export interface ApplyStatePresentation {
  kind: ApplyJobStateKind;
  /** The state in plain words. */
  title: string;
  /** Why, in the run's own words, for the states that have a reason. */
  sentence: string | null;
  action: ApplyStateAction;
  actionLabel: string | null;
  /** "1 question left for you", when the run handed one back. */
  questionsLeftLabel: string | null;
}

function formatQuestionsLeft(count: number): string | null {
  if (count < 1) {
    return null;
  }

  return count === 1
    ? "1 question left for you"
    : `${count} questions left for you`;
}

/**
 * Decides the whole of an application's row and detail header from the run.
 *
 * `mode` only changes what a finished fill means: with the switch off a
 * filled form is Ready to send, and with it on a run that filled everything
 * and stopped short of sending is the person's to finish too — Job Finder
 * never claims a submission it did not verify.
 */
export function resolveApplyStatePresentation(input: {
  mode: ApplyMode;
  now?: number;
  pendingQuestionCount?: number;
  result: ApplyResult;
}): ApplyStatePresentation {
  const {
    mode,
    now = Date.now(),
    pendingQuestionCount = 0,
    result,
  } = input;
  const questionsLeftLabel = formatQuestionsLeft(pendingQuestionCount);
  const reason = getApplicationStopReasonSentence(result);

  if (applyResultIsStillRunning(result)) {
    const elapsed = formatElapsedMinutes(result?.startedAt, now);
    return {
      kind: "filling_in",
      title: elapsed ? `Filling in (${elapsed})` : "Filling in",
      sentence: null,
      action: "none",
      actionLabel: null,
      questionsLeftLabel: null,
    };
  }

  // Applied is only ever a verified employer-side outcome. An uncertain one
  // is never dressed up as a submission (ADR 0012).
  const submissionOutcome =
    result?.privacyReceipt?.submissionOutcome?.outcome ?? null;
  if (submissionOutcome === "submitted" || result?.state === "submitted") {
    return {
      kind: "applied",
      title: "Applied",
      sentence: null,
      action: "none",
      actionLabel: null,
      questionsLeftLabel: null,
    };
  }

  const needsPerson =
    looksLikeSignInWall({
      blockerCode: result?.blockerReason ?? null,
      text: `${result?.blockerSummary ?? ""} ${result?.detail ?? ""}`,
    }) ||
    looksLikeAccountWall({
      blockerCode: result?.blockerReason ?? null,
      text: `${result?.blockerSummary ?? ""} ${result?.detail ?? ""}`,
    });

  if (needsPerson) {
    return {
      kind: "needs_you",
      title: "Needs you",
      sentence:
        reason ??
        `This site wants you to sign in or make an account. Do that in ${JOB_FINDER_BROWSER_NAME} and Job Finder can carry on.`,
      action: "open_browser",
      actionLabel: OPEN_THE_BROWSER_ACTION,
      questionsLeftLabel,
    };
  }

  // The run worked the form to the end and handed back what only the
  // person can answer: a declaration, a question nothing on file covers.
  // That is theirs to finish, not a failure.
  if (applyResultHasQuestionForPerson(result, pendingQuestionCount)) {
    return {
      kind: "needs_you",
      title: "Needs you",
      sentence:
        reason ??
        "The form asks something only you can answer. Answer it here, or finish it in the browser.",
      action: "open_browser",
      actionLabel: OPEN_THE_BROWSER_ACTION,
      questionsLeftLabel,
    };
  }

  if (result?.state === "awaiting_review" || submissionOutcome !== null) {
    return {
      kind: "ready_to_send",
      title: "Ready to send",
      sentence:
        mode === "apply_for_me"
          ? "Job Finder filled it in but did not send it. Read it over and click Apply on the site."
          : "Job Finder filled it in. Read it over and click Apply on the site.",
      action: "open_browser",
      actionLabel: OPEN_THE_BROWSER_ACTION,
      questionsLeftLabel,
    };
  }

  if (result?.state === "blocked" || result?.state === "failed") {
    // A retry only earns a button when a fresh run could genuinely differ.
    const retryCanDiffer =
      !applyResultStoppedStructurally(result) &&
      !applyResultBlockedBySiteSaves(result);
    return {
      kind: "could_not_apply",
      title: "Could not apply",
      sentence: reason ?? "The run ended before the application was finished.",
      action: retryCanDiffer ? "try_again" : "open_browser",
      actionLabel: retryCanDiffer ? TRY_AGAIN_ACTION : OPEN_THE_BROWSER_ACTION,
      questionsLeftLabel,
    };
  }

  return {
    kind: "ready_to_send",
    title: "Ready to send",
    sentence: "Job Finder filled it in. Read it over and click Apply on the site.",
    action: "open_browser",
    actionLabel: OPEN_THE_BROWSER_ACTION,
    questionsLeftLabel,
  };
}

/** The one per-job control in Shortlisted, named for what the mode does. */
export function applyActionLabel(mode: ApplyMode): string {
  return mode === "apply_for_me" ? "Apply" : "Apply";
}

/** The one list-level control in Shortlisted. */
export function applyAllActionLabel(mode: ApplyMode): string {
  return mode === "apply_for_me"
    ? "Apply to all shortlisted"
    : "Fill in all shortlisted";
}
