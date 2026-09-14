import type { ApplyBlockedAttempt } from "@unemployed/contracts";

/**
 * Deciding whether something the guard blocked is worth stopping for.
 *
 * A page makes requests of its own all day: analytics, fonts, a widget posting
 * its own form. Blocking those is the containment working, not a reason to
 * stop an application. What does matter is the site trying to save an answer
 * Job Finder just typed, or trying to send the form, or trying to open a
 * window or start a download. Those stop the run and are said plainly.
 */

export function attemptKey(attempt: ApplyBlockedAttempt): string {
  return `${attempt.kind}|${attempt.method}|${attempt.url ?? ""}|${attempt.at}`;
}

function isContainmentAttempt(attempt: ApplyBlockedAttempt): boolean {
  return (
    attempt.kind === "popup_open" ||
    attempt.kind === "download" ||
    attempt.kind === "window_open"
  );
}

function isPageOwnBackgroundTraffic(attempt: ApplyBlockedAttempt): boolean {
  return !attempt.kind.includes("submit") && !isContainmentAttempt(attempt);
}

function isCrossOrigin(
  attempt: ApplyBlockedAttempt,
  pageUrl: string | null,
): boolean {
  if (!attempt.url || !pageUrl) {
    return false;
  }
  try {
    return new URL(attempt.url).origin !== new URL(pageUrl).origin;
  } catch {
    return false;
  }
}

export type BlockedAttemptJudgement =
  | { stop: false; tolerated: boolean; note: string | null }
  | { stop: true; summary: string };

/**
 * What to do about the most recent blocked attempt.
 *
 * `hasWritten` is whether Job Finder has touched the page yet. Before it has,
 * nothing the page does can be a consequence of this run, so ordinary
 * background traffic is noted and tolerated. Once it has, every same-origin
 * write is a possible save of an answer and stops the run.
 */
export function judgeBlockedAttempt(input: {
  attempt: ApplyBlockedAttempt | null;
  acknowledged: ReadonlySet<string>;
  hasWritten: boolean;
  pageUrl: string | null;
  lastFieldLabel: string | null;
}): BlockedAttemptJudgement {
  const { attempt } = input;
  if (!attempt) {
    return { stop: false, tolerated: false, note: null };
  }
  if (input.acknowledged.has(attemptKey(attempt))) {
    return { stop: false, tolerated: false, note: null };
  }

  if (isContainmentAttempt(attempt)) {
    return {
      stop: true,
      summary:
        attempt.kind === "download"
          ? "The site tried to download a file on its own, so Job Finder stopped and left the form as it was."
          : "The site tried to open another window on its own, so Job Finder stopped and left the form as it was.",
    };
  }

  if (!input.hasWritten && isPageOwnBackgroundTraffic(attempt)) {
    return {
      stop: false,
      tolerated: true,
      note: "The page made a request of its own before anything was filled in. It was blocked and nothing was sent.",
    };
  }

  // The guard could see the form when it blocked this. A request to another
  // site carrying none of the answers cannot have saved one.
  if (
    attempt.carriedPreparedValue === false &&
    isCrossOrigin(attempt, input.pageUrl) &&
    (!input.hasWritten || isPageOwnBackgroundTraffic(attempt))
  ) {
    return {
      stop: false,
      tolerated: true,
      note: "The page made a request to another site carrying none of your answers. It was blocked and nothing was sent.",
    };
  }

  if (attempt.kind.includes("submit")) {
    return {
      stop: true,
      summary:
        "The page tried to send the application on its own. Job Finder blocked it and stopped, so nothing was sent.",
    };
  }

  return {
    stop: true,
    summary: input.lastFieldLabel
      ? `The site tried to save your answer to "${input.lastFieldLabel}" straight away. Job Finder blocked it and stopped, so nothing was sent.`
      : "The site tried to send something while the form was being filled in. Job Finder blocked it and stopped, so nothing was sent.",
  };
}
