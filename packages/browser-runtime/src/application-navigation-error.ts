/**
 * Typed failure raised only at the application goto boundary: the dedicated
 * browser could not load the employer application page, so preparation never
 * opened it and nothing was filled, attached, or submitted.
 *
 * The user-facing copy is causal-free on purpose. Chromium/Playwright error
 * text (`detail`) is carried for diagnostics surfaces only and must never be
 * copied into result summaries, details, checkpoints, or user-action copy.
 */
export class ApplicationNavigationError extends Error {
  readonly targetUrl: string;

  /** Raw underlying transport detail. Diagnostics-only; never user-facing. */
  readonly diagnosticDetail: string;

  readonly userSummary = "Job Finder could not open the application page";

  readonly userDetail: string;

  constructor(input: { targetUrl: string; diagnosticDetail: string }) {
    super(
      `The dedicated browser could not open ${input.targetUrl}: ${input.diagnosticDetail}`,
    );
    this.name = "ApplicationNavigationError";
    this.targetUrl = input.targetUrl;
    this.diagnosticDetail = input.diagnosticDetail;
    this.userDetail =
      "The dedicated browser could not load this employer page, so preparation stopped before the page opened. Nothing was filled, attached, or submitted. Retry preparation, or open the page yourself to confirm the link works.";
  }
}

export function isApplicationNavigationError(
  error: unknown,
): error is ApplicationNavigationError {
  return error instanceof ApplicationNavigationError;
}
