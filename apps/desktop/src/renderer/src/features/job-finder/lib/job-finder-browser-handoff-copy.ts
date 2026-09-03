/**
 * One name for the browser, one name for each hand-off action.
 *
 * Round-eight review (F03, P0) found the same window called four different
 * things across four screens — "the open browser", "the Job Finder browser",
 * "the managed browser" and "SEARCH BROWSER" — while the action that confirms
 * the user came back had three names that changed in place: "I finished this
 * step" became "Check again" became "Step is complete". The app also never
 * said the window existed, where it was, or that the user had to switch to it
 * and come back.
 *
 * Every user-facing string that refers to that window or to the hand-off must
 * come from this module. Nothing here performs, authorizes or implies a
 * submission: Job Finder opens and fills the application, and the person
 * reviews and submits it themselves.
 */

/**
 * The canonical name of the separate browser window Job Finder drives.
 * Used mid-sentence; {@link JOB_FINDER_BROWSER_NAME_SENTENCE_START} is the
 * capitalised form.
 */
export const JOB_FINDER_BROWSER_NAME = "the Job Finder browser";

/** Sentence-initial form of {@link JOB_FINDER_BROWSER_NAME}. */
export const JOB_FINDER_BROWSER_NAME_SENTENCE_START = "The Job Finder browser";

/**
 * Said once, at the moment the user is sent out, so the window is never a
 * thing they are expected to already know about.
 */
export const JOB_FINDER_BROWSER_IS_A_SEPARATE_WINDOW = `${JOB_FINDER_BROWSER_NAME_SENTENCE_START} is a separate window outside this app.`;

/** Opens or focuses that window on the paused application page. */
export const OPEN_JOB_FINDER_BROWSER_ACTION = "Open the Job Finder browser";

/**
 * The same control after the hand-off has already happened. The window is
 * open, so the action is no longer "open" and is no longer the primary path —
 * confirming is.
 */
export const REOPEN_JOB_FINDER_BROWSER_ACTION = "Reopen the Job Finder browser";

/**
 * The single confirm action, in every place the user comes back to. Named for
 * its object (this step) so it is distinguishable at a glance from
 * {@link RUN_PREPARATION_AGAIN_ACTION}, which re-runs preparation from
 * scratch. It never changes its own name: while the check runs the control is
 * pending, and a failed check is reported beside it rather than by renaming
 * it.
 */
export const CONFIRM_STEP_DONE_ACTION = "Check whether this step is done";

/** In-flight label for {@link CONFIRM_STEP_DONE_ACTION}. */
export const CONFIRM_STEP_DONE_PENDING_LABEL = "Checking the application page…";

/**
 * Re-runs preparation. Deliberately not called "retry": the two controls sat
 * adjacent at two weights while their labels ("Check again" / "Retry
 * preparation later") did not say which object each acted on.
 */
export const RUN_PREPARATION_AGAIN_ACTION = "Run preparation again";

/**
 * Named the same way whether it is offered now or deferred, so the deferred
 * variant is recognisably the same action.
 */
export const RUN_PREPARATION_AGAIN_LATER_ACTION = "Run preparation again later";

/**
 * The instruction itself. Names the window, says where it is, says the user
 * must switch to it and come back, and states the prepare-only boundary in
 * the same breath so it cannot be read as "Job Finder will finish this".
 */
export const FINISH_IN_JOB_FINDER_BROWSER_INSTRUCTION =
  `Finish this application in ${JOB_FINDER_BROWSER_NAME}. ` +
  `${JOB_FINDER_BROWSER_IS_A_SEPARATE_WINDOW} Switch to it, complete the step ` +
  `there, then come back here and choose "${CONFIRM_STEP_DONE_ACTION}".`;

/** Compact one-line variant for list rows, where the detail pane carries the rest. */
export const FINISH_IN_JOB_FINDER_BROWSER_LIST_NEXT_STEP = `Finish this application in ${JOB_FINDER_BROWSER_NAME}, then come back and confirm`;

/**
 * Status shown beside the confirm action once the window has been opened or
 * focused on this application. It states what is true now instead of
 * repeating the instruction a second way.
 */
export const JOB_FINDER_BROWSER_OPENED_STATUS =
  `Opened in ${JOB_FINDER_BROWSER_NAME}. Switch to that window to finish the step, ` +
  `then come back here.`;

/**
 * Shown when the window cannot be opened from this screen. Still names the
 * window rather than describing a permission model.
 */
export const JOB_FINDER_BROWSER_UNAVAILABLE_NOTE =
  `${JOB_FINDER_BROWSER_NAME_SENTENCE_START} cannot be opened from here right now. ` +
  `Use the window if it is already open, or open this step from Needs you.`;

/**
 * The prepare-only boundary in one sentence, for the prepare dialog and the
 * Applications hand-off. Job Finder fills; the person submits.
 */
export const PREPARE_ONLY_BOUNDARY_SENTENCE =
  "Job Finder opens the application and fills it in. It never submits — " +
  "reviewing and sending the application stays yours.";

/**
 * Identity line for the prepare dialog, so the user can see which job they
 * are agreeing to before they agree. Falls back gracefully when the employer
 * is not known rather than printing an absence placeholder.
 */
export function formatPrepareApplicationSubject(input: {
  jobTitle: string | null;
  employerName: string | null;
}): string | null {
  const title = input.jobTitle?.trim() ?? "";
  const employer = input.employerName?.trim() ?? "";

  if (title && employer) {
    return `${title} at ${employer}`;
  }
  if (title) {
    return title;
  }
  if (employer) {
    return employer;
  }
  return null;
}

/**
 * What the prepare dialog promises will happen, named for the exact job. The
 * dialog previously said only "Use visual checkpoints?" and named neither the
 * job nor the employer, so there was nothing on screen identifying what was
 * being agreed to.
 */
export function formatPrepareApplicationDescription(
  subject: string | null,
): string {
  const opening = subject
    ? `Job Finder will open ${subject} in ${JOB_FINDER_BROWSER_NAME} and fill in the application with your approved resume.`
    : `Job Finder will open this application in ${JOB_FINDER_BROWSER_NAME} and fill it in with your approved resume.`;

  return `${opening} It stops before the employer's submit control — reviewing and sending the application stays yours.`;
}
